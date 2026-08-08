# VideoQ デプロイ

## 本番構成

- frontend: Cloudflare Pages
- Web API: Cloudflare Workers（Hono）
- DB: Neon PostgreSQL + Hyperdrive
- object storage: Cloudflare R2
- async queue: Amazon SQS
- async compute: Python worker on AWS Lambda

## 1. DB と R2

1. Neon project と pooler connection を作成
2. Cloudflare Hyperdrive を Neon に接続（**query caching は無効**にする。有効だと DELETE 後も古い SELECT が返り、動画削除などが消えたように見えない）
3. R2 bucket と S3 API token を作成
4. `apps/api/wrangler.jsonc` の binding ID / bucket を本番値に設定

DB schema:

```bash
cd apps/api
DATABASE_URL="<Neon pooler URL>" npm run db:migrate
```

## 2. API secrets

機密値は `wrangler secret put` で設定します。

```bash
cd apps/api
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put USER_SECRET_ENCRYPTION_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put SQS_QUEUE_URL
npx wrangler secret put AWS_ACCESS_KEY_ID
npx wrangler secret put AWS_SECRET_ACCESS_KEY
```

`BETTER_AUTH_SECRET` と `USER_SECRET_ENCRYPTION_KEY` は別々に生成します
（例: `openssl rand -base64 48`）。
`USER_SECRET_ENCRYPTION_KEY` は base64url encoded 32 bytes を使用し、API と worker に
同じ値を設定してください。

非機密設定（`wrangler.jsonc` `env.production.vars`）:

- `ENVIRONMENT=production`
- `BETTER_AUTH_URL`（公開 API origin。例: `https://videoq.jp`。cookie / OAuth issuer の基準）
- `FRONTEND_URL` / `CORS_ALLOW_ORIGIN`
- `R2_BUCKET_NAME` / `R2_S3_ENDPOINT` / `R2_S3_REGION`（`USE_S3_STORAGE=true` 時必須。未設定だと `/api/videos` が 500）
- embedding / LLM model
- Hyperdrive、R2、KV、Durable Object binding

Cookie session は `sameSite=lax` です。frontend と API を同一サイト（例: `videoq.jp` + `/api`）で配信してください。オリジン分離する場合は cookie 属性の見直しが必要です。

## 3. API deploy

`main` への CI 成功後、CD が `apps/api` の変更を検知すると
`wrangler deploy --minify --env production` を実行します
（[`.github/workflows/cd.yml`](../.github/workflows/cd.yml)）。

必要な GitHub Actions secrets:

| Secret | 用途 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Workers デプロイ用 API トークン（Edit Cloudflare Workers 相当） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

手動デプロイ:

```bash
cd apps/api
npm ci
npm run typecheck
npm test
npm run deploy
```

確認:

```bash
curl https://videoq.jp/health
curl https://videoq.jp/ready
curl https://videoq.jp/api/openapi.json
```

## 4. Worker infrastructure

Terraform は SQS、worker Lambda（**arm64**）、ECR、IAM、SSM Parameter Store
など AWS 側の非同期基盤を管理します。

### Secrets Manager → SSM への移行（既存環境）

worker 機密は **SSM SecureString**（`/videoq/<env>/db`, `/videoq/<env>/app`）に置きます。
`terraform apply` で旧 Secrets Manager リソースが削除される前に、値をコピーしてください。

```bash
REGION=ap-northeast-1

# 1) 現行 Secrets Manager から読む
DB_JSON=$(aws secretsmanager get-secret-value \
  --secret-id videoq/prod/db --region "$REGION" \
  --query SecretString --output text)
APP_JSON=$(aws secretsmanager get-secret-value \
  --secret-id videoq/prod/app --region "$REGION" \
  --query SecretString --output text)

# 2) SSM へ書き込み（未作成なら作成、既存なら上書き）
aws ssm put-parameter --region "$REGION" \
  --name /videoq/prod/db --type SecureString \
  --value "$DB_JSON" --overwrite
aws ssm put-parameter --region "$REGION" \
  --name /videoq/prod/app --type SecureString \
  --value "$APP_JSON" --overwrite

# 3) すでに手動作成済みなら Terraform state へ取り込む
cd infra
terraform import aws_ssm_parameter.db /videoq/prod/db
terraform import aws_ssm_parameter.app /videoq/prod/app

# 4) 旧 Secrets Manager は prevent_destroy のため、state から外して apply する
terraform state rm aws_secretsmanager_secret.db
terraform state rm aws_secretsmanager_secret.app

# 5) 旧シークレットを手動削除（課金停止。必要なら recovery window 付きでも可）
aws secretsmanager delete-secret --region "$REGION" \
  --secret-id videoq/prod/db --force-delete-without-recovery
aws secretsmanager delete-secret --region "$REGION" \
  --secret-id videoq/prod/app --force-delete-without-recovery
```

新規環境では `terraform apply` がプレースホルダ値で SSM を作ります。直後に上記
`put-parameter --overwrite` で実値を入れてください（`value` は Terraform が
ignore するため apply で上書きされません）。

```bash
cd infra
cp backend.hcl.example backend.hcl
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```

IAM ポリシー JSON を更新した場合は `infra/iam/README.md` の更新手順で
`videoq-terraform-deploy` を差し替えてから apply してください。

**arm64 cutover:** Lambda の `architectures = ["arm64"]` とイメージ arch は一致が必須です。
`terraform apply` の前に、下の手順で **arm64 イメージを ECR に push** してください
（amd64 のまま arch だけ変えると更新が失敗します）。

worker image（**linux/arm64**）:

```bash
REGION=ap-northeast-1
WORKER_ECR=<account>.dkr.ecr.$REGION.amazonaws.com/videoq-worker-prod

aws ecr get-login-password --region "$REGION" |
  docker login --username AWS --password-stdin "${WORKER_ECR%%/*}"

docker buildx build --platform linux/arm64 --provenance=false --push \
  -f apps/worker/Dockerfile -t "$WORKER_ECR:latest" ./apps/worker

aws lambda update-function-code \
  --function-name videoq-worker-prod \
  --image-uri "$WORKER_ECR:latest" \
  --region "$REGION"
```

### App parameter (`/videoq/<env>/app`) JSON schema

SSM SecureString の app パラメータは **R2 用キー名を `R2_*` にする**
（Terraform はパラメータ器のみ管理。値は CLI で設定）。

```json
{
  "OPENAI_API_KEY": "...",
  "USER_SECRET_ENCRYPTION_KEY": "...",
  "R2_ACCESS_KEY_ID": "...",
  "R2_SECRET_ACCESS_KEY": "...",
  "R2_BUCKET_NAME": "videoq-media-prod",
  "R2_S3_ENDPOINT": "https://<accountid>.r2.cloudflarestorage.com",
  "R2_S3_REGION": "auto"
}
```

`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` をここに入れないこと。
Lambda 実行ロールが同名を予約しており、R2 キーが無視されて文字起こしが 400 になります。

API Worker（Cloudflare）の SQS 送信用クレデンシャルは別 IAM ユーザー
（例: `videoq-workers-api`）を `wrangler secret` の `AWS_ACCESS_KEY_ID` /
`AWS_SECRET_ACCESS_KEY` / `AWS_REGION` / `SQS_QUEUE_URL` に設定します。

## 5. Frontend

Cloudflare Pages:

| 項目 | 値 |
|---|---|
| root directory | `frontend` |
| build command | `npm run build` |
| output | `dist` |
| `VITE_API_URL` | 公開 API origin または `/api` |
| `VITE_USE_S3_STORAGE` | `true` |

同一 host で配信する場合、`/api/*` と `/.well-known/*` を Worker route に割り当てます。

## 6. 既存環境の破壊的cutover

この手順はdomain dataを新tableへコピーしますが、既存password、browser session、
OAuth client/grant/token、配信済みメールリンク、保存済みSearchAPI keyを意図的に失効します。
実行前にDB backupを取得し、利用者へpassword resetと資格情報の再登録が必要なことを告知してください。

```bash
cd apps/api
export DATABASE_URL="<Neon direct connection URL>"

# maintenance window前に件数だけ確認
npm run db:maintain -- dry-run

# API write停止、SQS drain、DB backup後に実行
npm run db:maintain -- prepare
npm run db:maintain -- cutover
npm run db:maintain -- verify
```

`cutover`はdomain tableをID維持で再コピーし、credential失効とorphan/count検証を同一処理で行います。
成功後にAPI・frontend・workerを同時deployし、trafficを再開します。失敗時はwriteを再開せず、
取得済みbackupから復元してください。旧tableは即時削除しません。

7〜14日のsoak後:

```bash
npm run db:maintain -- rename --dry-run
npm run db:maintain -- rename --confirm

# backup保持期間の終了後のみ
npm run db:maintain -- drop --dry-run
npm run db:maintain -- drop --confirm
```

## 7. Better Auth cutover（破壊的）

`0005_better_auth` 適用後:

- 旧 password / browser session / API key / OAuth client・token は無効
- 既存ユーザーは **パスワード再設定必須**（credential `account` 行は空パスワードで作成される）
- SearchAPI key はクリアされるので再入力が必要
- MCP / 第三者 OAuth クライアントは再登録が必要

運用手順:

1. DB backup
2. maintenance window（API write 停止）
3. `DATABASE_URL=... npm run db:migrate`（`0005_better_auth` 含む）
4. secrets / vars（`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`）を確認
5. API と frontend を同時デプロイ
6. 利用者へ password reset・API key / OAuth / SearchAPI 再発行を告知

## 8. リリース確認

- `/health` と `/ready`
- signup / login / logout（cookie session）
- password reset 後に既存利用者が login でき、旧 password では login できないこと
- API key 再発行と `x-api-key` での保護 API 呼び出し
- OAuth client 再登録、consent / device、SearchAPI key 再入力
- R2 署名 upload と動画確定
- SQS enqueue と worker completion
- chat / SSE（`credentials: include`）
- `/api/openapi.json`
- OAuth discovery / DCR / PKCE
- MCP initialize / tools list

Cloudflare Workers logs と Lambda CloudWatch logs の両方を確認してください。
