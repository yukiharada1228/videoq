---
sidebar_label: オンプレの署名付き配布と更新
description: 署名とダイジェストを検証し、Kubernetes で更新と復元を検証する手順。
---

# オンプレの署名付き配布と更新

インターネットに接続できる導入先では、外部レジストリとイメージのダイジェストを使って配布します。`On-prem Release` は最新 main の push CI 成功を確認し、Linux amd64・arm64 の API、Web、ワーカー、Helm Chart、`release.json` を作成します。同じ main コミットで手動実行すると、OS パッケージ修正後の再ビルドにも使えます。

配布用の `ghcr.io/yukiharada1228/videoq-onprem-api`・`videoq-onprem-worker`・`videoq-onprem-web` は Public とします。Docker や Kubernetes からは GHCR のログインや `imagePullSecrets` なしで取得できます。導入先独自の非公開レジストリを使う場合は、引き続き `imagePullSecrets` を設定できます。各イメージにはリポジトリの現行 LICENSE を同梱し、公開範囲の変更でライセンス条件は変更しません。

パッケージ管理者が初期設定で Public にし、**Package settings → Manage Actions access** で `yukiharada1228/videoq` に **Write** を付与します。CI は push の前後とインデックス作成前に公開状態を確認し、非公開・internal・未作成の場合は配布を止めます。署名を検証した配布物は、空の Docker 認証設定で取得して匿名アクセスを確認します。公開済みパッケージを Private に戻すことは GitHub の仕様上できません。push 用の書き込み認証は引き続き必要です。

## 配布時に確認すること

アプリのビルドはリポジトリの読み取り権限だけで実行します。各イメージの未修正分を含む HIGH・CRITICAL 脆弱性を検査し、イメージと CycloneDX SBOM を保存します。別の新しいランナーで、そのイメージを実行せずに配布し、GitHub OIDC による来歴とアーキテクチャ別 SBOM の署名を付けます。両アーキテクチャを束ねるイメージインデックス、Chart のバイト列、全イメージのダイジェストも署名対象です。

API とワーカーはダイジェスト固定の Alpine イメージを使い、既存の Runtime Updates がインタープリターと npm・pip・uv の検証済み配布物を更新します。ベース変更には、Python wheel、PostgreSQL、FFmpeg、認証、Kubernetes の検証を必要とします。リリースの各実行・再試行には別のレジストリタグを使い、導入時はダイジェストを指定します。

`On-prem Validation` は関連変更時と毎日 main に対して実行し、脆弱性の再検査と使い捨て Kubernetes での検証を行います。配布後にも署名を検証して同じ検証環境を動かします。本番への反映は運用担当者が承認します。未修正という理由で脆弱性をまとめて除外しません。

## 配布物を取得して検証する

`gh attestation verify` に対応した GitHub CLI、Python 3.9 以上、Helm 4.3.1 を用意します。検証スクリプトはレビュー済みのチェックアウトから実行します。成功した `On-prem Release` の実行 ID と、別途確認した完全なソースコミット SHA を使ってください。ダウンロードした manifest 自体から信頼する SHA を決めないでください。

```sh
SOURCE_SHA=REPLACE_WITH_REVIEWED_40_CHARACTER_COMMIT
RUN_ID=REPLACE_WITH_SUCCESSFUL_RELEASE_RUN
RUN_ATTEMPT=$(gh run view "$RUN_ID" --repo yukiharada1228/videoq --json attempt --jq .attempt)
mkdir -p /secure/videoq-release
gh run download "$RUN_ID" --repo yukiharada1228/videoq \
  --name "onprem-release-$SOURCE_SHA-attempt-$RUN_ATTEMPT" --dir /secure/videoq-release
python3 .github/scripts/onprem-release.py verify "$SOURCE_SHA" \
  /secure/videoq-release/release.json /secure/videoq-release/verified-images.json
```

イメージの取得に GHCR のログインや `read:packages` 資格情報は不要です。上記の GitHub CLI の認証は、ワークフロー成果物のダウンロードと署名検証に使います。検証スクリプトは署名、対象ファイル、リポジトリ、配布ワークフロー、`refs/heads/main`、ソースコミット、GitHub ホストのランナーであることを確認します。manifest、Chart のチェックサムと署名、3 イメージの署名がすべて正しい場合だけ、Helm 用の値を置き換えます。失敗時は既存の値を保持します。

アーキテクチャ別 SBOM は、`gh attestation verify` の predicate に `https://cyclonedx.org/bom` を指定して確認できます。Chart、manifest、確認済みの値、SBOM、署名バンドルを保管してください。ワークフローの成果物は 90 日で期限切れになります。採用したイメージのダイジェストと署名をレジストリの削除ポリシーから保護します。

検証済みのイメージ指定は **最後** に読み込みます。

```sh
helm template videoq /secure/videoq-release/videoq-0.1.0-sha.$SOURCE_SHA.tgz \
  -n videoq -f /secure/site.yaml -f /secure/videoq-release/verified-images.json
helm upgrade --install videoq /secure/videoq-release/videoq-0.1.0-sha.$SOURCE_SHA.tgz \
  -n videoq -f /secure/site.yaml -f /secure/videoq-release/verified-images.json \
  --wait --timeout 15m
helm test videoq -n videoq --timeout 2m
```

Chart が強制するのはダイジェスト指定です。署名確認は導入側のスクリプトで行うため、クラスタ管理者による回避も防ぐ必要があれば、同じ署名者を条件とする admission policy を導入先で設定します。

## 検証環境から本番へ進める

独立した検証用 namespace と DB・ストレージ・キューを用意します。ソース SHA、配布実行 ID、Chart のチェックサム、各イメージのダイジェスト、サイト設定の版、DB マイグレーションの版を記録します。代表的なバックアップを復元し、アップロード、文字起こし、索引、引用付き Q&A、SSE、時刻指定の再生を確認した後、同じ配布物の本番導入を承認します。

GitOps を使う場合は、署名確認後の `verified-images.json` をレビュー可能な PR に保存し、承認済みの値を検証環境に同期させます。本番への反映は同じダイジェストを承認して進めます。導入先が未定の間は、このリポジトリにサイトへの接続資格情報を設定しません。

## ローカルで更新と復元を再現する

API、ワーカー、Web をそれぞれ `videoq-api:onprem-ci`、`videoq-worker:onprem-ci`、`videoq-web:onprem-ci` としてビルドし、Docker・kind・kubectl・Helm・Node・Python のある環境で実行します。

```sh
kind create cluster --name videoq-onprem-lab --kubeconfig /tmp/videoq-lab-kubeconfig
HELM_BIN=helm python3 .github/scripts/onprem-lab.py \
  /tmp/videoq-lab-kubeconfig /tmp/videoq-lab-results
kind delete cluster --name videoq-onprem-lab --kubeconfig /tmp/videoq-lab-kubeconfig
```

専用クラスタ内に検証専用の PostgreSQL/pgvector、Garage、ElasticMQ、固定応答の推論 API を作成します。アップロード、実際の FFmpeg 音声抽出、キュー配信、文字起こし保存、索引、引用付き Q&A、SSE を通し、S3 データのバックアップ・削除・復元とチェックサム一致を確認します。DB を別の DB に復元して接続先を切り替え、API を 2 Pod に更新し、Helm テストと 1 Pod へのロールバック後にもデータを利用できることを検証します。すべて成功した場合だけ `result.json` が作成されます。資格情報を含む DB ダンプはコミットしません。

実モデルの認識・回答精度、GPU の性能、TLS・Ingress、ホスト障害時のストレージ・キューの永続性、バックアップの RPO/RTO は、導入先で別途検証してください。
