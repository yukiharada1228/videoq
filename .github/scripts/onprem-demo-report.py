"""Build a local, offline review page from an actual Mac demo acceptance result."""
import argparse
import html
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import quote


def render(result_path, case_path, output):
    result=json.loads(result_path.read_text());case=json.loads(case_path.read_text())
    audit=result_path.parent/'cleanup-audit.json'
    if audit.exists():result['cleanupAudit']=json.loads(audit.read_text())
    if result.get('measurementCompleted') is not True or result.get('status') not in ('passed','failed') or result.get('fixtureSha256')!=case['sha256'] or not result.get('benchmark',{}).get('rounds'):
        raise ValueError('A matching completed demo measurement is required')
    media=case_path.resolve().parent/case['file']
    if hashlib.sha256(media.read_bytes()).hexdigest()!=case['sha256']:
        raise ValueError('Report media checksum differs from the measured fixture')
    video=quote(os.path.relpath(media,output.resolve().parent),safe='/')
    payload=json.dumps({'case':case,'result':result},ensure_ascii=False).replace('<','\\u003c')
    document='''<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mac mini のオンプレ検証</title>
<style>body{max-width:1060px;margin:40px auto;padding:0 22px;font:16px/1.7 -apple-system,BlinkMacSystemFont,sans-serif;color:#183047;background:#f3f6f9}h1{font-size:30px;margin-bottom:6px}h2{font-size:22px}section{background:white;border:1px solid #d9e1e8;border-radius:14px;padding:24px;margin:24px 0}video{width:100%;max-height:470px;background:#14273a;border-radius:10px}table{width:100%;min-width:720px;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:left;border-bottom:1px solid #e3e9ee;padding:12px 8px}th{font-size:14px}.muted{color:#587086}pre{white-space:pre-wrap;font:inherit;background:#f5f7f9;padding:16px;border-radius:8px}button{padding:7px 12px;background:#e9f1fb;border:1px solid #adc4df;border-radius:6px;color:#183047;cursor:pointer}details{margin:12px 0;border-top:1px solid #e3e9ee;padding-top:14px}.overflow{overflow-x:auto}.tag{display:inline-block;background:#e8f3ed;color:#245f3c;padding:3px 10px;border-radius:20px;font-size:13px}.failed{background:#fff0ee;border:2px solid #c84236;color:#85281f}</style>
<h1>Mac mini のオンプレ検証</h1><p class="muted">架空の日本語デモを実際の VideoQ API で処理した結果</p><p><span class="tag">M4 / Metal</span> <span class="tag">動画・音声・AI はローカル処理</span></p>
<section id="status"><h2>判定</h2><p id="assessment"></p></section><section><h2>デモ動画</h2><video id="video" controls preload="metadata" src="__VIDEO__"></video><p class="muted">Mac の音声合成で作成した架空データです。社内動画の精度や本番の処理能力を保証する試験ではありません。</p></section>
<section><h2>初回の測定</h2><div id="initial"></div><p class="muted">モデル起動後に最初に処理した動画と質問。以下の比較に使うウォームアップ後の値とは分けています。</p></section>
<section><h2>ウォームアップ後の同時実行</h2><p class="muted">表は横にスクロールできます。</p><div class="overflow"><table><thead><tr><th>同時実行数</th><th>完了件数</th><th>動画の索引まで<br>中央値・秒</th><th>回答完了<br>中央値・秒</th><th>最初の回答文字<br>中央値・秒</th><th>完了処理数<br>件／分</th></tr></thead><tbody id="rounds"></tbody></table></div><p class="muted">同じ動画と3種類の質問を使い、全質問のウォームアップ後に同時実行1→2の順で測定しています。1処理には動画投入・文字起こし・索引・通常回答・ストリーミング回答を含みます。表示する中央値は観測値です。20件未満では p95 を推定せず、結果 JSON に件数と範囲を残します。<span id="latency-quality"></span></p></section>
<section><h2>文字起こしと答えの確認</h2><div id="quality"></div><h3>正解の読み上げ文</h3><pre id="reference"></pre><h3>実際の文字起こし</h3><pre id="transcript"></pre><div id="answers"></div></section>
<section><h2>検証範囲</h2><p id="environment"></p><p id="memory"></p><div id="lifecycle"></div><p id="verification"></p><p>アプリを専用 Kubernetes で動かし、推論は Mac の llama.cpp／whisper.cpp の Metal バックエンドを使用。モデルのチェックサムを検査し、推論プロセスと専用ノードで外部通信を制限しています。Chromium での動画再生、動画・DB の復元、設定更新とロールバックの結果を記録しています。引用が得られなかった場合、再生検証には固定時刻を使い、引用再生の合格とは扱いません。</p><p class="muted">NVIDIA vLLM の実機性能、導入先の CNI、実際の社内動画、運用中の負荷・障害復旧は、この測定の対象外です。</p></section>
<script id="data" type="application/json">__DATA__</script><script>
const {case:c,result:r}=JSON.parse(document.querySelector('#data').textContent),f=v=>Number(v).toFixed(2),add=(parent,tag,text)=>{const e=document.createElement(tag);e.textContent=text;parent.append(e);return e;};
const status=document.querySelector('#status');if(r.status!=='passed')status.classList.add('failed');document.querySelector('#assessment').textContent=`${r.status==='passed'?'合格':'不合格'}。回答チェック ${r.answerQuality.passed} / ${r.answerQuality.total} 件が合格。測定を完了しても、不正解・引用なしは合格にしません。`;
const initial=r.recognitionAndAnswer;document.querySelector('#initial').textContent=`動画の索引まで ${f(initial.processingSeconds)} 秒 ／ 通常回答 ${f(initial.answerSeconds)} 秒 ／ 最初の回答文字 ${f(initial.firstTextSeconds)} 秒 ／ ストリーミング完了 ${f(initial.streamSeconds)} 秒`;
for(const round of r.benchmark.rounds){const row=document.createElement('tr');for(const value of [round.concurrency,round.requests,f(round.processingSeconds.median),f(round.answerSeconds.median),f(round.firstTextSeconds.median),f(round.completedWorkflowsPerMinute)])add(row,'td',String(value));document.querySelector('#rounds').append(row);}
const cerValues=r.transcriptionAssessments.map(v=>v.cer*100),lo=Math.min(...cerValues),hi=Math.max(...cerValues);document.querySelector('#quality').textContent=`全文の文字誤り率（CER）: ${lo===hi?lo.toFixed(2)+'%（全'+cerValues.length+'回）':lo.toFixed(2)+'〜'+hi.toFixed(2)+'%'}。句読点・空白・全半角を正規化。漢数字と算用数字の表記差も誤りに数えています。章境界をまたぐ字幕があるため、区間別CERは判定に使っていません。`;
const explain={'Answer missed a required demo fact':'必要な事実が不足','Answer missed an expected demo value':'期待する数値・期間が不一致','Answer cited another video or no evidence':'引用がない、または別動画を引用','Citation did not overlap the reference chapter':'引用時刻が該当章と不一致'};
document.querySelector('#reference').textContent=c.reference;document.querySelector('#transcript').textContent=initial.transcript;
for(const round of r.benchmark.rounds)for(const trial of round.results){const q=c.questions.find(q=>q.id===trial.questionId),d=document.createElement('details');add(d,'summary',`同時実行 ${round.concurrency}：${q.text}`);add(d,'p','判定：'+(trial.assessments.every(a=>a.passed)?'合格':'不合格 — '+trial.assessments.filter(a=>!a.passed).map(a=>(a.kind==='streaming'?'ストリーミング':'通常回答')+'：'+(explain[a.error]??a.error)).join(' / ')));add(d,'p','正解：'+q.expectedAnswer);add(d,'p','通常回答：'+trial.answer.segments.map(s=>s.text).join(''));add(d,'p','ストリーミング回答：'+trial.streamedAnswer);for(const source of trial.answer.sources.filter(source=>trial.answer.segments.some(segment=>segment.sourceIds.includes(source.id)))){const button=add(d,'button','引用 '+source.start_time);button.onclick=()=>{const p=source.start_time.replace(',','.').split(':').map(Number),v=document.querySelector('#video');v.currentTime=p[0]*3600+p[1]*60+p[2];v.play();v.scrollIntoView({behavior:'smooth',block:'center'});};}document.querySelector('#answers').append(d);}
document.querySelector('#latency-quality').textContent=r.answerQuality.passed===r.answerQuality.total?'回答品質の判定を通過した応答の観測値です。':'不合格の応答を含む待ち時間です。回答品質の改善後に再測定が必要です。';
const swap=v=>{const m=/used = ([0-9.]+)M/.exec(v);return m?(Number(m[1])/1024).toFixed(2)+' GiB':v;};document.querySelector('#memory').textContent='スワップ使用量：開始 '+swap(r.hardware.swapBefore)+' ／ 終了 '+swap(r.hardware.swapAfter)+'。他の処理が動く開発用Macでの測定です。';for(const [key,label] of Object.entries({objectRestore:'動画データの復元（SHA256一致）',databaseRestore:'別DBへの復元・接続切り替え',upgrade:'設定更新（API 2台）',rollback:'巻き戻し（API 1台）',helmTest:'Helmの動作確認',retention:'保存期間の定期処理'}))add(document.querySelector('#lifecycle'),'p',label+'：'+(r[key].startsWith('passed')?'成功':r[key]));
if(r.cleanupAudit){const stopped=r.cleanupAudit.pausedWorkloads.filter(w=>!w.beforeRecovery.running);if(stopped.length)add(document.querySelector('#lifecycle'),'p',`検証中に既存${stopped.length}コンテナの停止を確認（原因未特定）。元のIDで再起動し、稼働を確認済み。`);}
document.querySelector('#verification').textContent=r.apiSourceBuild?'APIはローカルの検証用ソースビルドです。Worker・Web・モデル設定は署名済みリリースを使用しています。APIのリビジョンラベルとイメージIDを記録しています。':'アプリは署名検証済みのリリースを使用しています。';
document.querySelector('#environment').textContent=`${r.hardware.architecture} / メモリ ${(r.hardware.memoryBytes/1024**3).toFixed(0)} GiB / ${r.hardware.logicalCpus} CPU。アプリのソース ${r.sourceSha.slice(0,12)}。llama.cpp ${r.llamaVersion.split('\\n')[0]}。モデル ${r.nativeInference.chat.model.modelRepo}（${r.chatModelProfile}）。`;
</script></html>'''
    output.write_text(document.replace('__VIDEO__',html.escape(video,quote=True)).replace('__DATA__',payload),encoding='utf8')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('result',type=Path);p.add_argument('case',type=Path);p.add_argument('output',type=Path);a=p.parse_args();render(a.result,a.case,a.output)
