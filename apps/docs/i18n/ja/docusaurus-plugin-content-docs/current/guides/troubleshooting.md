---
title: 困ったとき
description: 起動・ログイン・動画処理・検索でつまずいたときの確認場所。
---

# 困ったとき

まず「画面」「API」「DB」「動画処理」のどこまで動いているかを確認します。最初からDBを作り直す必要はありません。

## 最初に見る3つの情報

```bash
docker compose ps -a
docker compose logs --tail=100 migrate api worker
curl -i http://localhost/ready
```

`migrate` と `minio-init` の終了コード `0` は正常です。`/health` は成功して `/ready` が失敗するなら、API自体は応答しており、DB接続やmigrationを確認する段階です。

## 画面が開かない・変更が反映されない

| 症状 | 確認すること |
|---|---|
| `localhost` が開かない | `gateway` と `web` の起動。ポート80を別アプリが使っていないか |
| 画面は開くがAPIが失敗する | `/health`、`/ready`、`api` のログ |
| 編集しても画面が変わらない | `localhost` は静的ビルド。`web-dev` を起動して `localhost:3000` を開く |
| ポート3000で起動できない | Composeの `web-dev` とホストのViteを同時に起動していないか |
| 文書の検索が動かない | `npm run build:docs` の後に `npm run preview:docs` で確認する |

## ログインできない

メール未設定のローカル環境なら、[セットアップのアカウント昇格](../getting-started/local-setup.md)を確認します。先にサインアップしていないと、昇格対象が見つかりません。

移行済みのローカルアカウントで `Password not found` が出る場合は、次の復旧用コマンドがあります。

```bash
npm run user:password:local --workspace @videoq/api -- your-username
```

ローカル用の一時パスワードが表示されます。共有環境や本番のログイン問題にそのまま使わないでください。

ローカルでログイン試行のレート制限に当たった場合は、APIを停止してからRateLimiterのローカル状態をリセットし、APIを再起動します。実行条件は [reset-rate-limit.sh](https://github.com/yukiharada1228/videoq/blob/main/apps/api/scripts/reset-rate-limit.sh)を確認してください。

## 動画の処理が進まない

まず動画IDと状態を控え、`worker` のログを確認します。

| 状態・症状 | 確認先 |
|---|---|
| `uploading` のまま | ブラウザからMinIOへの送信、ポート9000、アップロード完了通知 |
| `pending` のまま | `worker` と `elasticmq` の起動、APIのジョブ配送ログ |
| `processing` で失敗 | 音声の有無、FFmpeg・Whisperのログ、AIキー |
| `indexing` で失敗 | 埋め込みモデル・次元、DB接続、workerの例外 |
| YouTubeだけ失敗 | 設定画面のSearchAPIキーと取得対象の字幕 |
| サイズ・利用量で拒否される | Adminのアップロード上限・保存容量・月間利用量 |

状態の意味は[動画の状態遷移](../design/state-diagram.md)で確認できます。

## 検索できない・回答に引用がない

1. 質問先の講座に動画が含まれているか確認します。
2. 対象動画が `completed` で、文字起こしがあるか確認します。
3. [埋め込み診断コマンド](embeddings.md)でAPI・workerの `EMBEDDING_PROVIDER`・`EMBEDDING_MODEL` を照合します。次元は1536固定です。ログの内部理由から設定・DB・出力・保存済みPLOGデータのどこに不整合があるか確認します。
4. モデルを変更した場合は再索引が必要です。既存データの次元を設定値だけで変えることはできません。

講座名や動画本数などの質問は、登録情報だけで回答し、シーン引用がない場合があります。内容の質問でも動画に根拠がなければ、期待した回答が得られるとは限りません。

## 学習モードを開始できない

`completed` は動画の検索準備完了であり、PLOGの完了とは別です。動画詳細のPLOG状態と概念・関係を確認します。空のグラフや学習順序を作れないグラフは、編集・再生成の対象です。[PLOGと学習モード](../plog/README.md)を参照してください。

## 字幕を直したのに古い回答やヒントが出る

字幕の保存と、非同期の検索再索引の完了は別です。元からある動画の `completed` 表示では、今回の再索引が終わったかは分かりません。該当するworkerジョブを確認してから、新しいQ&Aの質問を送ります。以前に表示・保存された回答は変わりません。

Studyの支援文は保存字幕から近くの文章を直接読み、検索再索引の完了前でも修正内容を利用できます。一方、保存済みの問い・ヒントは字幕保存や検索再索引では更新しません。影響する学習データを確認して編集するか、残したい手編集を控えてからPLOGを明示的に再構築します。再構築は手編集を置き換え、進行中の学習を新しい概念IDへ引き継ぎません。操作を選ぶ前に[更新範囲の表と字幕修正の手順](../architecture/transcription-and-search.md#update-scope)を確認してください。

修正後の最初の問いとヒントは、[新しいStudyセッション](../plog/README.md#verify-in-fresh-session)で確認します。Q&A → Studyと切り替えて消えるのは会話表示だけです。既存の進捗があると、最初の問いを飛ばしたり、確認用の発言を以前の問いへの返答として採点したりする場合があります。

## 設定を変えたのに変化がない

Composeの `.env` は起動済みプロセスに自動反映されません。

```bash
docker compose up -d --force-recreate api worker
```

API側に転送される変数は [docker-dev.sh](https://github.com/yukiharada1228/videoq/blob/main/apps/api/scripts/docker-dev.sh)で限定されています。任意の変数を `.env` に追記しただけではAPIから読めない場合があります。

## チームに相談するとき

試した操作、画面のURL、動画ID、期待した結果、実際の状態、関係するログの時刻やrequest IDを共有すると原因を追いやすくなります。ログからキー・Cookie・利用者の非公開データを除いてください。
