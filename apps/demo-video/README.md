# 大学生向けVideoQデモ

## X広告動画（日英共通・2026-10-06）

`XAd` は日本語の配信中動画と同じ15秒・1080×1080・60fpsのコンポジションです。
日英で `XAd.tsx`、`x-ad.css`、`content/x-ad-timeline.json`、`ProductScreen` を共用し、
背景・ロゴ・レイアウト・ズーム・カーソル・クリック・BGM・場面切替をそろえています。
日本語で再描画した6つの確認フレームは、元の保存画像と4枚が完全一致し、残る2枚も
RGB合計で1および3階調の差だけでした。

英訳は `content/x-ad-en.json` に集約しています。元の教材・質問・取得済み回答を翻訳し、
引用範囲0:00–0:54を維持します。英語APIの新規回答や速度測定ではなく、
映像内に `Translated real-data demo · Waiting times shortened` と明記します。
教材の最初の場面も、元の描画座標・フォントを使って英語化しています。
日本語の既存LP動画と配信中広告は変更しません。

```bash
npm run typecheck --workspace @videoq/demo-video
node apps/demo-video/scripts/render-x-ad.mjs --locale en
# 日本語の比較フレーム（元の保存フレームは上書きしない）
node apps/demo-video/scripts/render-x-ad.mjs --locale ja --stills
```

完成MP4とVTTは `output/x-demo/`、確認画像は `review/x-ad/` に出力します。
書き出し時に全900フレーム、フラッシュ、固定ヘッダー、エンディング、尺、fps、
解像度、fast start、ファイルサイズを検査し、合格した動画だけを出力します。
X広告は15秒の正方形版を使用します。LPは以下の30秒の横長版を使用します。

## 日英LPの大学生向けデモ

Remotion製の30秒・1920×1080・60 fpsの操作紹介です。Screen Studioのように
操作箇所へ滑らかにズームし、カーソル・クリック・入力・回答・参照箇所の再生を見せます。
実画面の録画ではなく、VideoQの共有講座UIを再現した映像です。
日英で `StudentDemo`・`style.css`・`content/timeline.json`・カメラ・カーソル・BGMを共用します。
英語版は見えている講座画面・教材・質問・取得済み回答を英訳し、元の引用範囲を保ちます。
冒頭はWriting教材、2.2秒で数学を選択します。再生部分は元の数学教材と同じ静止スライドです。

## 教材と実際の回答

`content/course.json` に5教科のオリジナル教材を収録しています。
国語（主張と根拠）、数学（微分）、理科（DNA）、社会（需要と供給）、英語（主張と理由）。
各教科3章、約1分の音声付き動画を `public/lessons/` に生成します。

実際のAPIに通常のアップロード手順で登録し、通常の処理ワーカーでWhisper文字起こし・
Otsuシーン分割・埋め込みを実行します。台本から文字起こしや検索インデックスを直接挿入しません。
`content/answer.json` は公開講座の通常RAGエンドポイントが返した回答・引用の記録です。
数学の引用は実データどおり `0:00–0:54`。短い教材が1シーンになった結果をそのまま使用します。
映像用に狭い時刻を作り直すことはしません。

この版は専用のローカル環境で講座を登録・処理しています。本番環境の講座は変更していません。
共有スラッグは `videoq-campus-basics-v1`。LP再生には、この講座やAIへの通信は不要です。

## 再制作

ルートで `npm ci` を実行し、macOSの日本語音声 `Kyoko`、ffmpeg/ffprobe、PythonのPillowを用意します。
Remotionが管理するChrome Headless Shellを使用し、PNGフレームで書き出します。初回はブラウザーを自動取得します。
別の実行ファイルを使う場合だけ `REMOTION_BROWSER_EXECUTABLE` を指定してください。

```bash
# 教材・オリジナルBGMを生成（既存の素材だけ使う場合は不要）
npm run lessons --workspace @videoq/demo-video
python3 apps/demo-video/scripts/build-audio.py

# 通常のAPIと処理ワーカーを起動した環境で専用所有者に登録
npm run demo:students --workspace @videoq/api -- \
  --origin http://127.0.0.1:8787 --local-user <demo-owner-id>

# 登録内容を匿名で確認
npm run demo:students --workspace @videoq/api -- \
  --origin http://127.0.0.1:8787 --check

# 実際のAI回答を更新（所有者のAI利用枠を消費するため、意図した更新時だけ実行）
node apps/demo-video/scripts/capture-answer.mjs

# 型検査・編集プレビュー・書き出し
npm run typecheck --workspace @videoq/demo-video
npm run studio --workspace @videoq/demo-video
npm run render --workspace @videoq/demo-video
# 英語LPだけを更新
npm run render --workspace @videoq/demo-video -- --locale en
```

登録CLIはファイルのSHA-256と講座固有マーカーで再利用を判断します。
`--upload-only` では処理を待たず、後から同じコマンドで公開まで再開できます。
公開環境へ登録する際はHTTPSの `--origin` と `VIDEOQ_DEMO_COOKIE_FILE` を使います。
Cookieは権限600のファイルに保存し、ソース・CLI引数・ログへ記録しないでください。
既存の別教材入り講座や異なる共有スラッグは上書きしません。
教材内容を変える場合は新しいスラッグに切り替えて再登録してください。

回答取得先は `VIDEOQ_DEMO_ORIGIN` で変更できます。
回答・参照先を更新したら、映像の選択教科と引用先が一致していることも確認してください。

30秒版の書き出し先は `apps/web/public/demo/student-demo-{ja,en}.mp4` と対応するWebP/VTTです。
`--locale en` / `--locale ja` で片方だけを再生成できます。
15秒の広告書き出し処理はLPの配信ファイルを上書きしません。
MP4が配信上限の16 MiBを超えると書き出しスクリプトは失敗します。
`review/` に確認用の静止画を生成します（Git対象外）。`-- --stills` で静止画のみ作成できます。

## 編集の範囲

`content/timeline.json` が秒数・fps・操作時刻・字幕を共通管理します。
`src/StudentDemo.tsx` がUI、ズーム、カーソルを定義します。カメラ移動は約0.4〜0.6秒です。
実回答はJSONから読んでおり、ハードコードした模範解答ではありません。
表示の待ち時間を短縮しており、回答速度の測定動画ではありません。
LPにも実データに基づく操作再現であることを表示します。
教材・BGMはこのデモ用のオリジナル制作で、外部の授業映像や楽曲は使用していません。

## フレームの検証

以前のデスクトップChrome/JPEGによる書き出しでは、画面がタイル状に重複するフレームが混ざりました。
現在は専用のHeadless Shell・ANGLE・PNGを使用し、完成したMP4を全フレーム検査します。
`scripts/verify-video.py` は固定ヘッダーの変化、前後から大きく外れる単発フレーム、
尺・fps・解像度・fast start・ファイルサイズを確認します。
既知の壊れた旧動画でも異常を検出することを確認しています。
検査に失敗した動画は `review/` に残し、LPの既存ファイルを置き換えません。
結果は `review/*-quality.json` に保存します。手動確認は次のコマンドで行えます。
CIのFrontend Buildでも配信対象の日英MP4を全フレーム検査します。Remotion自体の再レンダリングは行いません。

```bash
python3 apps/demo-video/scripts/verify-video.py apps/web/public/demo/student-demo-ja.mp4
python3 apps/demo-video/scripts/verify-video.py apps/web/public/demo/student-demo-en.mp4
```

表示デザインを変更するときは固定ヘッダーの検査領域も見直してください。
尺を変更した場合はLPの翻訳・Storybookの再生時間も更新し、配信用URLの `v` を進めます。
