# VideoQ デプロイ手順

## アーキテクチャ概要

```
ブラウザ
  │ https://videoq.jp
  ▼
CloudFront (CDN)
  ├── /api/*  ──→ API Gateway HTTP API
  │                      │
  │                      ▼
  │              Lambda API (Django + Lambda Web Adapter)
  │                      │                    │
  │                      ▼                    ▼
  │                Neon PostgreSQL      SQS キュー
  │                (pgvector)                │
  │                                          ▼
  │                                  Lambda Worker (Celery タスク)
  │                                          │
  │                                          ▼
  │                                  Cloudflare R2 (動画ストレージ)
  │
  └── /* (その他) ──→ Cloudflare Pages (フロントエンド)
```

> **なぜ CloudFront？** フロントエンド (Cloudflare Pages) と API (API Gateway) を
> 同一ドメインで配信することで、Cookie がファーストパーティになり、
> モバイルブラウザのサードパーティ Cookie ブロックによる 403 エラーを解消する。

**月額コスト目安:** ~$0.85/月 (低トラフィック時は Lambda 無料枠内で $0.05 以下)

---

## 前提条件

- AWS CLI 設定済み (`aws configure`)
- Docker Desktop 起動済み
- Node.js 20+, Terraform 1.5+

---

## 【一度だけ】CDK → Terraform 移行ランブック

> 既存の **CDK スタックが稼働中**のアカウントで初めて Terraform へ切り替えるときだけ
> 実施する。新規アカウントなら不要 (Step 1 以降へ)。方針は
> **「CDK を destroy → Terraform で作り直し」**。ダウンタイムが発生する。
>
> - **Secrets** は `RemovalPolicy.RETAIN` で destroy しても孤立して残るため、
>   destroy ワークフローで強制削除し、Terraform 作成後に値を再入力する
>   (`SECRET_KEY` が変わるので全セッション/トークンは失効する)。
> - **ECR** は destroy でイメージごと消えるため、Lambda 作成前にイメージを push する
>   必要がある (ニワトリ卵問題)。下記は ECR を先に apply してから push する。

移行は共有 state (S3) を汚さないよう、**ローカル (または移行ブランチ) から順に実行**し、
最後に PR をマージして以降の自動 apply に引き継ぐ。

```bash
# 0. state バックエンドを作成 (Step 2 のブートストラップと同じ。まだなら実施)
cd infra/bootstrap && terraform init && terraform apply && cd ..
terraform init          # S3 バックエンドを初期化 (state は空)

# 1. 稼働中の CDK スタック + 孤立 Secrets を削除
#    GitHub → Actions → "CDK Destroy (one-time migration)" を workflow_dispatch で実行し
#    confirm 欄に destroy-prod を入力 (production 環境の承認が必要)。
#    ※ ローカルで実施する場合は aws cloudformation delete-stack を
#      Cdn → Api/Worker → Queue/Storage/Data の順に + secretsmanager delete-secret --force...

# 2. ECR リポジトリだけ先に作成
terraform apply -target=aws_ecr_repository.api -target=aws_ecr_repository.worker

# 3. イメージをビルド & push (Step 6 と同じ。:latest が必須)
#    → 下記 Step 6 のコマンドを実行

# 4. 残りをすべて作成 (Secrets は空で作られる / Lambda / API GW / SQS / CloudFront)
terraform apply

# 5. Secrets に値を再入力 (Step 5) → 6. マイグレーション (Step 8)
#    → 7. 新しい CloudFront ドメインへ DNS を貼り替え (Step 10)

# 8. 移行完了後: .github/workflows/cdk-destroy.yml を削除し、PR をマージ。
#    以降は infra/** の変更で terraform-apply workflow が自動 apply する。
```

> **注意:** state を先に埋めてからマージすること。空 state のまま `main` にマージすると
> `terraform-apply` workflow が全リソースを作ろうとし、ECR が空の状態で Lambda 作成に失敗する。

---

## Step 1: 外部サービスのセットアップ

### 1-1. Neon (サーバーレス PostgreSQL)

1. [neon.tech](https://neon.tech) でプロジェクト作成
2. **Pooler 接続文字列**をコピー (通常の接続文字列ではなく Pooler を使うこと)

   ```
   # ダッシュボード → Connection Details → Pooler
   postgresql://neondb_owner:****************dep-old-truth-a1co51ud-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

   > **なぜ Pooler？** Lambda はリクエストごとに新規 DB 接続を張るため、
   > Pooler (PgBouncer) なしでは同時実行時に接続数上限に達する。

### 1-2. Cloudflare R2 (オブジェクトストレージ)

1. Cloudflare ダッシュボード → **R2** → バケット作成
   - バケット名: `videoq-media-prod`

2. **R2 API トークン**を発行
   - R2 → 概要 → API トークンを管理 → トークン作成
   - 権限: オブジェクトの読み取りと書き込み
   - 以下をメモ:
     - Access Key ID
     - Secret Access Key
     - アカウント ID (ダッシュボード URL の `/` 以降の32桁)

3. エンドポイント URL を確認:
   ```
   https://<アカウントID>.r2.cloudflarestorage.com
   ```

### 1-3. ACM 証明書 (カスタムドメイン使用時)

CloudFront でカスタムドメイン (例: `videoq.jp`) を使う場合、**us-east-1** リージョンに ACM 証明書が必要。

1. AWS コンソール → **Certificate Manager** → リージョンを **us-east-1 (バージニア北部)** に切り替え
2. 「証明書のリクエスト」 → パブリック証明書
3. ドメイン名: `videoq.jp` (必要に応じて `*.videoq.jp` も追加)
4. 検証方法: **DNS 検証** を選択
5. 表示される CNAME レコードを DNS プロバイダに追加して検証完了を待つ
6. 証明書 ARN をメモ:
   ```
   arn:aws:acm:us-east-1:<account>:certificate/<uuid>
   ```

> **注意:** CloudFront は us-east-1 の証明書のみ使用可能。他リージョンで作成した証明書は使えない。

### 1-4. Cloudflare Pages (フロントエンド)

初回は Step 8 で設定するため、ここでは不要。

---

## Step 2: Terraform セットアップ

```bash
cd infra

# AWS アカウント ID とリージョンを確認
aws sts get-caller-identity
aws configure get region

# 変数ファイルを用意して環境に合わせて編集
cp terraform.tfvars.example terraform.tfvars
# custom_domain / certificate_arn / pages_domain / image_tag などを設定

# ── State バックエンドを一度だけ用意する (S3) ──
# backend.tf は S3 バックエンドを参照する。バケットは bootstrap で作成:
cd bootstrap
terraform init
terraform apply        # videoq-terraform-state-<account> バケットを作成
cd ..

# プロバイダをダウンロードしてバックエンドを初期化
terraform init
```

> **State バックエンド:** `backend.tf` が S3 バックエンド
> (`videoq-terraform-state-<account>` バケット) を参照する。このバケットは
> `infra/bootstrap` を一度 `apply` して作成する (state 保存先そのものを作るため
> ローカル state で管理)。`cdk bootstrap` の代替。ロックは S3 ネイティブ
> (`use_lockfile`, Terraform 1.11+) を使うため DynamoDB は不要。
> 別アカウントで使う場合は `backend.tf` の bucket 名 (アカウント ID 部分) を書き換える。

---

## Step 3: 初回 Terraform デプロイ

```bash
# 変更内容を確認 (terraform.tfvars の値が使われる)
terraform plan

# 適用
terraform apply -auto-approve
```

変数は `terraform.tfvars` のほか、`TF_VAR_*` 環境変数でも指定できる (CI ではこちらを使用):

```bash
# CloudFront + カスタムドメインを有効化する場合 (Step 1-3 の証明書が必要)
TF_VAR_pages_domain=videoq.pages.dev \
TF_VAR_custom_domain=videoq.jp \
TF_VAR_certificate_arn=arn:aws:acm:us-east-1:<account>:certificate/<uuid> \
  terraform apply -auto-approve
```

> **CloudFront は条件付き:** `custom_domain` と `certificate_arn` の両方が設定されている場合のみ CloudFront ディストリビューションが作成される (`enable_cdn` ローカル値で制御)。

### infra 変更時の継続デプロイ（GitHub Actions）

初回セットアップ後は、`infra/**` を変更した PR をマージすることで自動的に `terraform apply` が実行される。

| タイミング | 動作 |
|---|---|
| PR 作成・更新時 | `terraform plan` を実行し結果を PR にコメント (terraform-plan workflow) |
| `main` マージ後 | GitHub Environment `production` の手動承認後に `terraform apply -auto-approve` を自動実行 (terraform-apply workflow) |

GitHub Environment `production` に承認者を設定しておくこと（Settings → Environments → production → Required reviewers）。
CI では `TF_VAR_pages_domain` / `TF_VAR_custom_domain` / `TF_VAR_certificate_arn` を GitHub Secrets から渡す。

デプロイ完了後、以下の Output をメモしておく (`terraform output` で再表示可能):

```
api_ecr_url            = <account>.dkr.ecr.<region>.amazonaws.com/videoq-api-prod
worker_ecr_url         = <account>.dkr.ecr.<region>.amazonaws.com/videoq-worker-prod
db_secret_arn          = arn:aws:secretsmanager:...
app_secret_arn         = arn:aws:secretsmanager:...
api_endpoint           = https://xxxxxxxxxx.execute-api.<region>.amazonaws.com
distribution_domain_name = dxxxxxxxxx.cloudfront.net   # CloudFront 有効時のみ
distribution_id        = EXXXXXXXXXXXXX                # CloudFront 有効時のみ
```

---

## Step 5: シークレットを登録

### DB シークレット (Neon 接続文字列)

```bash
aws secretsmanager put-secret-value \
  --secret-id videoq/prod/db \
  --secret-string '{
    "DATABASE_URL": "postgresql://neondb_owner:****************dep-old-truth-a1co51ud-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
  }'
```

### アプリシークレット + R2 認証情報

```bash
aws secretsmanager put-secret-value \
  --secret-id videoq/prod/app \
  --secret-string '{
    "SECRET_KEY": "<50文字以上のランダム文字列>",
    "AWS_ACCESS_KEY_ID": "<R2_ACCESS_KEY_ID>",
    "AWS_SECRET_ACCESS_KEY": "<R2_SECRET_ACCESS_KEY>",
    "AWS_S3_ENDPOINT_URL": "https://<CF_ACCOUNT_ID>.r2.cloudflarestorage.com",
    "AWS_STORAGE_BUCKET_NAME": "videoq-media-prod",
    "AWS_S3_REGION_NAME": "auto",
    "MAILGUN_API_KEY": "<YOUR_MAILGUN_API_KEY>",
    "MAILGUN_SENDER_DOMAIN": "<YOUR_MAILGUN_DOMAIN>"
  }'
```

> `SECRET_KEY` の生成: `python -c "import secrets; print(secrets.token_urlsafe(50))"`

---

## Step 6: コンテナイメージをビルド & プッシュ

```bash
# ECR URI を変数に設定 (Step 3 の Output から)
API_ECR=<account>.dkr.ecr.<region>.amazonaws.com/videoq-api-prod
WORKER_ECR=<account>.dkr.ecr.<region>.amazonaws.com/videoq-worker-prod
REGION=ap-northeast-1

# ECR ログイン
aws ecr get-login-password --region $REGION \
  | docker login --username AWS --password-stdin \
    $(echo $API_ECR | cut -d/ -f1)

# API Lambda イメージ (Lambda Web Adapter)
docker build --platform linux/amd64 --provenance=false \
  -f backend/Dockerfile.lambda \
  -t $API_ECR:latest ./backend
docker push $API_ECR:latest

# Worker Lambda イメージ
docker build --platform linux/amd64 --provenance=false \
  -f backend/Dockerfile.worker \
  -t $WORKER_ECR:latest ./backend
docker push $WORKER_ECR:latest
```

---

## Step 7: Lambda イメージを更新

```bash
aws lambda update-function-code \
  --function-name videoq-api-prod \
  --image-uri $API_ECR:latest \
  --region $REGION

aws lambda update-function-code \
  --function-name videoq-worker-prod \
  --image-uri $WORKER_ECR:latest \
  --region $REGION

# 更新完了を待機
aws lambda wait function-updated \
  --function-name videoq-api-prod --region $REGION
aws lambda wait function-updated \
  --function-name videoq-worker-prod --region $REGION
```

---

## Step 8: Django マイグレーション (初回 & スキーマ変更時)

Docker を使った方法:
```bash
docker run --rm \
  -e DATABASE_URL="<Neon pooler URL>" \
  -e DJANGO_ENV=production \
  -e SECRET_KEY=temporary-key-for-migrate \
  --entrypoint python \
  $API_ECR:latest \
  manage.py migrate --settings=videoq.settings
```

---

## Step 9: Cloudflare Pages セットアップ (初回のみ)

1. Cloudflare ダッシュボード → **Pages** → プロジェクト作成
2. Git リポジトリを接続 (GitHub)
3. ビルド設定:

   | 項目 | 値 |
   |---|---|
   | フレームワーク | なし |
   | ビルドコマンド | `npm run build` |
   | ビルド出力ディレクトリ | `dist` |
   | ルートディレクトリ | `frontend` |

4. **環境変数**を設定:

   | 変数名 | 値 (CloudFront あり) |
   |---|---|
   | `VITE_API_URL` | `/api` (相対パス) |
   | `VITE_MAX_VIDEO_UPLOAD_SIZE_MB` | `500` |

---

## Step 10: DNS レコード設定

Step 3 で出力された `distribution_domain_name` を DNS に登録する。

| タイプ | 名前 | 値 |
|---|---|---|
| CNAME (または ALIAS) | `videoq.jp` | `dxxxxxxxxx.cloudfront.net` (Step 3 の distribution_domain_name) |

> **注意:** ルートドメイン (`videoq.jp`) の場合、CNAME は使えないため ALIAS レコード (Route 53) または CNAME フラットニング (Cloudflare DNS 等) が必要。

### 動作確認

```bash
# CloudFront 経由でフロントエンドが返ること
curl -I https://videoq.jp/

# CloudFront 経由で API が返ること
curl -I https://videoq.jp/api/health/
```

---

## 以降のデプロイ (コード変更時)

### backend / worker の変更

`backend/**` の変更は `main` マージ後に GitHub Actions (CD workflow) が自動デプロイする。

### infra の変更

`infra/**` の変更は GitHub Actions (Terraform workflow) が処理する。

1. PR を作成すると `terraform plan` 結果が PR に自動コメントされる (terraform-plan)
2. `main` マージ後、GitHub Environment `production` の承認者に通知が届く
3. 承認すると `terraform apply -auto-approve` が自動実行される (terraform-apply)

### 手動デプロイが必要な場合

```bash
# backend
# 1. イメージをリビルド & プッシュ
docker build --platform linux/amd64 --provenance=false -f backend/Dockerfile.lambda -t $API_ECR:latest ./backend && docker push $API_ECR:latest
docker build --platform linux/amd64 --provenance=false -f backend/Dockerfile.worker -t $WORKER_ECR:latest ./backend && docker push $WORKER_ECR:latest

# 2. Lambda を更新
aws lambda update-function-code --function-name videoq-api-prod --image-uri $API_ECR:latest --region $REGION
aws lambda update-function-code --function-name videoq-worker-prod --image-uri $WORKER_ECR:latest --region $REGION

# 3. マイグレーションがある場合
DATABASE_URL="<Neon pooler URL>" python backend/manage.py migrate

# infra
cd infra
TF_VAR_pages_domain=videoq.pages.dev TF_VAR_custom_domain=videoq.jp TF_VAR_certificate_arn=... \
  terraform apply -auto-approve

# フロントエンドは Cloudflare Pages が Git push で自動デプロイ
```

---

## トラブルシューティング

### Lambda が起動しない

```bash
# CloudWatch Logs を確認
aws logs tail /aws/lambda/videoq-api-prod --follow --region $REGION
```

よくある原因:
- `DB_SECRET_ARN` / `APP_SECRET_ARN` の値が未設定 → Step 5 を再実行
- `SECRET_KEY` が未設定で production 起動に失敗 → App シークレットを確認

### DB 接続エラー

- Pooler URL を使っているか確認 (`ep-xxx-pooler` の形式)
- `?sslmode=require` がついているか確認
- Neon ダッシュボードでプロジェクトがアクティブか確認

### R2 アップロード失敗

- `AWS_S3_REGION_NAME=auto` になっているか確認 (AWS リージョン名を入れると失敗する)
- R2 API トークンに書き込み権限があるか確認

### CORS エラー (フロントエンドからの API 呼び出し失敗)

```bash
# カスタムドメインを CORS 許可リストに追加して再デプロイ
TF_VAR_pages_domain=videoq.pages.dev \
TF_VAR_custom_domain=videoq.jp \
TF_VAR_certificate_arn=arn:aws:acm:us-east-1:<account>:certificate/<uuid> \
  terraform apply -auto-approve
```

### CloudFront 403 エラー

- ACM 証明書が **us-east-1** で作成されているか確認
- ACM 証明書のステータスが「発行済み」になっているか確認 (DNS 検証が完了していない可能性)
- `CUSTOM_DOMAIN` の DNS レコードが CloudFront の `DistributionDomainName` を指しているか確認

### CloudFront でキャッシュが効かない / 古いコンテンツが表示される

```bash
# CloudFront キャッシュを無効化
aws cloudfront create-invalidation \
  --distribution-id <DistributionId> \
  --paths "/*"
```

### モバイルブラウザで 403 エラー (サードパーティ Cookie ブロック)

CloudFront を使って同一ドメイン配信にすることで解消される。Step 9 を実施すること。
