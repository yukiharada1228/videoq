# ランタイムとパッケージマネージャーの更新

`.github/runtime-versions.json` を唯一の管理元にします。Node.js、Python、npm、pip、uv の版と配布物のハッシュを記録し、`.node-version`、`.nvmrc`、`.python-version`、`package.json` の `packageManager`、該当する Dockerfile を生成します。CI・ビルド・デプロイはこの指定を使います。

Runtime Updates は毎日09:13 JSTと手動実行で、公式のリリース情報を確認して更新PRを作ります。既存の `PATCH_BOT_APP_ID` / `PATCH_BOT_PRIVATE_KEY` を再利用し、このリポジトリの contents / pull-requests 権限だけを要求します。App tokenを使うため通常のPR CIが実行されます。本番の資格情報は使いません。手動実行の既定値はdry runです。

現在の系列の修正更新と、新しい系列への更新は別PRです。Node.jsは現在のメジャー内の最新版、および現在より新しいLTSを対象にします。Python、npm、pipは現在の系列の最新版と次の安定系列を分離します。1.0未満のuvはminorを系列として扱います。プレリリースとダウングレードは対象外です。Dockerの同じタグが再構築された場合もdigestを更新します。

更新PRは自動マージしません。未提供のPythonビルド、コンテナ、wheel、互換性エラーは失敗として表示します。新系列の失敗は現在系列のセキュリティ修正を止めません。人が修正した更新PRや同名の管理外ブランチを上書きしません。mainが途中で変わった場合は次回実行で再確認します。

```sh
python3 .github/scripts/runtime-versions.py check
python3 .github/scripts/runtime-versions.py sync
python3 .github/scripts/runtime-versions.py plan --runtime node --output runtime-plan.json
python3 .github/scripts/runtime-versions.py plan --runtime python --upgrade --output runtime-plan.json
```

`plan`は読み取り専用で、変更案をJSONへ出力します。Node.jsの配布情報はnodejs.org、Pythonはpython.org、npmはnpm registry、pipはPyPI、uvとstandalone Pythonは公式GitHub Releasesを参照します。npm/pip/uvのインストール前に、レビュー済みmanifestのハッシュを検証します。uvはLinux/macOSのamd64/arm64に対応します。npmのインストールスクリプト、uvのsource build、未検証のpip bootstrapスクリプトは実行しません。

VideoQ の CI・ローカル Python と Lambda の Python マイナー系列を連動して更新します。Lambda の ARM64 イメージでネイティブ処理と脆弱性検査を実行します。

## Lambda の Python パッチ版

CI・ローカルは manifest の Python 完全版を使用します。Lambda は AWS が配布する同じマイナー系列のイメージを digest で固定し、日次で追跡します。AWS 内のパッチ版は公式 Python の公開時期と異なる場合があります。
