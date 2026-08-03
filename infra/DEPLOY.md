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
2. Cloudflare Hyperdrive を Neon に接続
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
npx wrangler secret put AUTH_JWT_SECRET
npx wrangler secret put USER_SECRET_ENCRYPTION_KEY
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put SQS_QUEUE_URL
npx wrangler secret put AWS_ACCESS_KEY_ID
npx wrangler secret put AWS_SECRET_ACCESS_KEY
```

`AUTH_JWT_SECRET` と `USER_SECRET_ENCRYPTION_KEY` は別々に生成します。
`USER_SECRET_ENCRYPTION_KEY` はbase64url encoded 32 bytesを使用し、APIとworkerに
同じ値を設定してください。
メール操作とOAuth HTML formのaction tokenはDBにSHA-256だけを保存するランダム値であり、
追加の共有secretは不要です。

非機密設定:

- `ENVIRONMENT=production`
- `FRONTEND_URL=https://<public-host>`
- `CORS_ALLOW_ORIGIN=https://<public-host>`
- `OAUTH_ISSUER_URL=https://<public-host>`
- embedding / LLM model
- Hyperdrive、R2、KV、Durable Object binding

## 3. API deploy

```bash
cd apps/api
npm ci
npm run typecheck
npm test
npm run deploy
```

確認:

```bash
curl https://<api-host>/health
curl https://<api-host>/ready
curl https://<api-host>/api/openapi.json
```

## 4. Worker infrastructure

Terraform は SQS、worker Lambda、ECR、IAM など AWS 側の非同期基盤を管理します。

```bash
cd infra
cp backend.hcl.example backend.hcl
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```

worker image:

```bash
REGION=ap-northeast-1
WORKER_ECR=<account>.dkr.ecr.$REGION.amazonaws.com/videoq-worker-prod

aws ecr get-login-password --region "$REGION" |
  docker login --username AWS --password-stdin "${WORKER_ECR%%/*}"

docker build --platform linux/amd64 --provenance=false \
  -f apps/worker/Dockerfile -t "$WORKER_ECR:latest" ./apps/worker
docker push "$WORKER_ECR:latest"

aws lambda update-function-code \
  --function-name videoq-worker-prod \
  --image-uri "$WORKER_ECR:latest" \
  --region "$REGION"
```

Lambda には少なくとも DB、SQS、R2、AI、`USER_SECRET_ENCRYPTION_KEY` を設定します。

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

## 7. リリース確認

- `/health` と `/ready`
- signup / login / refresh / logout
- password reset後に既存利用者がloginでき、旧passwordではloginできないこと
- refresh token rotationと使用済みtoken再利用時のsession family失効
- OAuth client再登録、SearchAPI key再入力
- R2 署名 upload と動画確定
- SQS enqueue と worker completion
- chat / SSE
- `/api/openapi.json`
- OAuth discovery / DCR / PKCE
- MCP initialize / tools list

Cloudflare Workers logs と Lambda CloudWatch logs の両方を確認してください。
