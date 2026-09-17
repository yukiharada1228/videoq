# VideoQ デプロイ

## 本番構成

- frontend: Cloudflare Pages `videoq-web`（`apps/web`、公開URL: `https://videoq.jp`）
- Web API: Cloudflare Workers `videoq-api`（`apps/api`、Hono）
- DB: Neon PostgreSQL + Hyperdrive
- object storage: Cloudflare R2
- async queue: Amazon SQS
- async compute: Python worker on AWS Lambda

## 1. DB と R2

1. Neon project と pooler connection を作成
2. Cloudflare Hyperdrive を Neon に接続（**query caching は無効**にする。有効だと認証・権限・課金を含む read-after-write が古くなる）
3. R2 bucket と、`videoq-media-prod` の Object Read & Write のみに制限した S3 API token を作成
4. `apps/api/wrangler.jsonc` の binding ID / bucket を本番値に設定

既存の本番 Hyperdrive と R2 CORS は、production environment の承認後に手動workflow
[`cloudflare-resources.yml`](../.github/workflows/cloudflare-resources.yml)を実行して同期します。
同じ処理をローカルから行う場合:

```bash
cd apps/api
npm run cf:hyperdrive:disable-cache
npm run cf:r2-cors:apply
npm run cf:hyperdrive:show
npm run cf:r2-cors:list
```

R2 CORS の正本は `apps/api/r2-cors.production.json` です。`https://videoq.jp` からの
署名付き `GET` / `HEAD` / `PUT` と、動画range requestに必要なheaderだけを許可します。
これを設定しないと、署名URLが正しくてもブラウザからのupload・再生は失敗します。

DB schema:

```bash
cd apps/api
npm run db:check
npm run db:verify
DATABASE_URL="<Neon pooler URL>" npm run db:migrate
```

DBを参照するAPI／Lambdaの更新より先にmigrationを完了させます。CDも
`db-migrate → API/worker deploy` の順序を強制し、`DATABASE_URL` 未設定時は停止します。

## 2. API secrets

機密値は `wrangler secret put` で設定します。

```bash
cd apps/api
npx wrangler secret put BETTER_AUTH_SECRET --env production
npx wrangler secret put USER_SECRET_ENCRYPTION_KEY --env production
npx wrangler secret put OPENAI_API_KEY --env production
npx wrangler secret put MAILGUN_API_KEY --env production
npx wrangler secret put R2_ACCESS_KEY_ID --env production
npx wrangler secret put R2_SECRET_ACCESS_KEY --env production
npx wrangler secret put SQS_QUEUE_URL --env production
npx wrangler secret put AWS_ACCESS_KEY_ID --env production
npx wrangler secret put AWS_SECRET_ACCESS_KEY --env production
# Google sign-in (optional; both required)
npx wrangler secret put GOOGLE_CLIENT_ID --env production
npx wrangler secret put GOOGLE_CLIENT_SECRET --env production
# Stripe Billing（restricted key rk_ を推奨。未設定なら Checkout / Portal / webhook は 503）
npx wrangler secret put STRIPE_SECRET_KEY --env production
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env production
npx wrangler secret list --env production
```

`MAILGUN_API_KEY` は本番必須です。`mg.videoq.jp` をMailgunで検証し、SPF・DKIMを設定します。
Cloudflare Email Sendingはaccountで検証済みの宛先に限定され、product emailには適さないため
bindingを持ちません。

Google Cloud Console の OAuth Web クライアントに Authorized redirect URI を登録:

- 本番: `https://videoq.jp/api/auth/callback/google`
- ローカル: `{BETTER_AUTH_URL}/api/auth/callback/google`（例: `http://localhost:8787/api/auth/callback/google`）

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
- Hyperdrive、R2、Durable Object binding（KVは使用しない）

Cookie session は `sameSite=lax` です。frontend と API を同一サイト（例: `videoq.jp` + `/api`）で配信してください。オリジン分離する場合は cookie 属性の見直しが必要です。

## 3. API deploy

本番Worker名は `videoq-api`、開発用は `videoq-api-dev` です。
既存Workerを改名するときは、Cloudflare dashboardで既存サービスの名前を変更してから
`wrangler.jsonc` を更新します。設定の名前だけを変えてdeployすると別Workerを作成するため、
Durable Objectの保存データを引き継げません。改名後はrouteとbindingの維持を確認してください。

本体repositoryの`main`へのpushで起動したCIが成功した後、CDが変更を検知すると
`wrangler deploy --minify --env production` を実行します
（[`.github/workflows/cd.yml`](../.github/workflows/cd.yml)）。
CDはGitHub APIでCIのworkflow ID、起動event、repository、branch、commit、最新attemptの成功を
再検証します。fork／PRからのCI、古いcommitの再実行、`main`以外の手動実行はdeployしません。
手動CDも現在の`main`と同じSHAのpush CI成功が必要です。rollbackは修正／revertをPR経由で
`main`へ反映してCIを通します。

### GitHubの保護設定

- `main`: PR必須、`CI Success`成功必須、最新mainとの同期必須、force push／削除禁止。
  管理者にも適用します。現在は管理者1名のため必須の他者承認数は0です。
  複数のmaintainerで運用する場合は1以上にし、workflow変更のCODEOWNERSも設定してください。
- `production-deploy`: API deploy／DB migration専用。deploy可能なbranchは`main`だけ
  （同名tagは許可しない）。手動承認は不要で、上記CI検証後に自動deployします。
- `production`: インフラ／Cloudflare resource同期用。既存の手動承認を維持し、
  deploy可能なbranchを`main`だけにします。
- forkのActionsはすべての外部contributorについて承認を要求します。
- Actionsは完全なcommit SHAに固定し、Dependabotで更新します。

環境のbranch制限は`GITHUB_REF`を判定するため、`workflow_run`の起動元検証の代用には
なりません。CDの検証jobは本番secretもOIDC権限も持たず、信頼されたworkflow revisionの
検証コードを実行します。AWS用OIDC権限はLambda deploy jobだけに付与します。

### GitHub Actions secretsの保存先

| Secret | 保存先 | 用途 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `production-deploy`と`production`のEnvironment secrets | Workers deploy／resource同期時のsecret名確認 |
| `DATABASE_URL` | `production-deploy`のEnvironment secrets | 本番DB migration専用。依存インストール時は渡さない |
| `CLOUDFLARE_INFRA_TOKEN` | `production`のEnvironment secrets | 対象accountのHyperdrive更新とR2 CORS更新 |
| `CLOUDFLARE_ACCOUNT_ID` | Repository secrets（非機密ID） | Cloudflare account ID |

Workers deploy tokenは、対象accountの`Workers Scripts Write`（画面ではWorkers Scriptsの
Edit／レガシー）と、`videoq.jp` zoneの`Workers Routes Write`を許可します。
同じaccountの他のWorkerの作成・更新・削除にも使えるため、Environment secretsの隔離を
維持してください。2026-09-18の実デプロイでは、`videoq-api`単体の`Editor`は
サービス情報取得とversion uploadで認証エラーになりました。productの`Metadata Read-Only`を
追加すると前者のみ解消し、productの`Editor`はtoken保存時に`Scope not found`となったため、
現状は対応済みの`Workers Scripts Write`を使用します。Cloudflare側の対応を確認できたら、
個別Workerの権限でdeployを再検証して範囲を縮小してください。
R2／Hyperdrive bindingのあるWorkerのdeployに、
それらのリソース自体への編集権限は不要です。
resource同期tokenは対象accountの`Hyperdrive Write`と`Workers R2 Storage Write`に限定します。
Global API Keyは使用しません。tokenの有効期限は90日とし、期限前に同じ権限で更新します。
権限の詳細は[Workers roles and permissions](https://developers.cloudflare.com/workers/authorization/workers/)と
[Bindingsの権限](https://developers.cloudflare.com/workers/authorization/#bindings)を参照してください。

既存Repository secretsから移行する場合、GitHubは保存済みsecret値を返さないため、
元の値をEnvironment secretsへ再登録します。値をログやPRへ出力しないでください。
上表の4件を登録したことを確認してから、repository側の`CLOUDFLARE_API_TOKEN`、
`DATABASE_URL`、`CLOUDFLARE_INFRA_TOKEN`を削除します。同名Repository secretsを残すと、
environmentを指定しないworkflowでも利用できるため、隔離は完了しません。
元のDB接続文字列が手元にない場合は、稼働中のworker Lambdaの`DB_PARAM_NAME`が指す
SSM SecureStringから再登録できます。DBパスワードをresetして稼働中の接続を切らないでください。
旧CDはenvironmentを指定していないため、移行とこのworkflow変更のmergeを同じ作業時間帯で
行い、他のdeployを開始しないでください。登録完了前に旧secretを削除しないでください。

手動resource同期workflowは、上記tokenに加えて必須Worker secretの「名前」がproductionに
揃っていることも検証します。値は取得・出力しません。

手動デプロイ:

```bash
npm ci
npm run typecheck --workspace @videoq/api
npm test --workspace @videoq/api
npm run deploy --workspace @videoq/api
```

確認:

```bash
curl https://videoq.jp/health
curl https://videoq.jp/ready
```

`wrangler.jsonc` はproduction logsを100%、tracesを5%で保存します。デプロイ後はWorkers
Observabilityでexception・CPU超過と `external_task_backlog_warning` の通知を設定してください。

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

GitHub Actionsは固定AWS access keyではなく、plan / deployを分離したOIDC roleを使います。
初回作成とrepository secrets（`AWS_GITHUB_ACTIONS_PLAN_ROLE_ARN`、
`AWS_GITHUB_ACTIONS_DEPLOY_ROLE_ARN`）は[`iam/README.md`](iam/README.md)を参照してください。

既存Lambdaが一度でも動作済みなら、CloudWatch Logs groupはAWSが先に作成しています。
`monitoring.tf`の宣言的な`import`ブロックが最初のapplyで既存groupをstateへ取り込み、
以後は通常のTerraformリソースとして管理します。

`operations_alert_email`を設定すると、Lambda error / ジョブ失敗 / throttle / 長時間実行、SQS滞留、
DLQ到達をSNS emailで通知します。apply後にAWSから届くsubscription確認メールを承認して
ください。ログ保持期間は`lambda_log_retention_days`（既定30日）です。

待ち行列と実行時間は別々のアラームで監視します。すべてのアラームは警告（ALARM）と
復旧（OK）の両方を通知します。OKメールは新しい障害の通知ではありません。

| アラーム末尾 | 条件 |
|---|---|
| `job-failures` | SQSイベントの失敗数が5分間の合計で1件以上。`batchItemFailures`で返された失敗も対象 |
| `queue-waiting` | 取得可能な処理待ちが1件以上の状態を、1分ごとの最小値で5回連続観測 |
| `queue-depth` | 処理待ち10件以上を5分ごとの最大値で2回連続観測 |
| `duration` | 15分区間の最大実行時間がLambdaタイムアウトの80%以上（既定12分）。1件でも検知 |

`queue-waiting`はキュー全体の処理待ちが続く状態を検知し、個々のジョブの待ち時間は
計測しません。[SQSの可視メッセージ数](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-available-cloudwatch-metrics.html)を
使うため、処理待ち0件で8〜9分かかる実行中ジョブだけでは警告しません。
旧`queue-age`はapply時に`queue-waiting`へ置き換えます。

`job-failures`はイベントソースで`EventCount`を有効にし、`EventSourceMappingUUID`単位の
[`FailedInvokeEventCount`](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-types.html#event-source-mapping-metrics)を
監視します。ハンドラーが例外を捕捉して`batchItemFailures`を返す場合、Lambdaの`Errors`では
検知できません。この指標は処理終了時刻で記録されるため、失敗したジョブが再試行まで
非表示になる間も、処理待ち件数や実行時間に依存せず失敗を通知できます。
`job-failures`のOK通知は直近の集計から失敗の検知がなくなったことを示し、対象ジョブの
再試行成功を保証しません。再試行の結果は`job_executions`とworker logsで確認してください。

[Lambdaの実行時間指標](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics-view.html)は
開始時刻をタイムスタンプとして処理終了後に送信されるため、`duration`は実行中の即時通知では
ありません。長い処理の遅れて届く指標も評価できるよう、15分の集計区間を使います。

RAGAS評価の出力上限は`worker_ragas_max_tokens`（既定4,096）で設定し、Lambdaへ
`RAGAS_MAX_TOKENS`として渡します。ローカルでは`.env`に同じ環境変数を設定します。
これは評価の中間JSONを含むLLM呼び出しごとの上限です。切り詰め警告が続く場合は、
利用モデルの出力上限内で調整してください（既定の
[`gpt-4o-mini`](https://developers.openai.com/api/docs/models/gpt-4o-mini)は最大16,384）。
上限の増加により、長い評価の生成時間と使用トークン数が増える場合があります。
この環境変数を読むworker imageとTerraform設定の両方をリリースしてください。

**arm64 cutover:** Lambda の `architectures = ["arm64"]` とイメージ arch は一致が必須です。

SQS の `sqs_visibility_timeout_seconds` は Lambda のタイムアウトの6倍以上にします
（既定900秒に対して5400秒）。`sqs_max_receive_count` は5回以上です。
[AWS の推奨](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html)に合わせ、
throttle 時の再試行猶予を確保します。失敗したメッセージの再配送まで最大90分待つため、
滞留監視とDLQの確認も行ってください。既存の `terraform.tfvars` に960秒／3回を
指定している環境では、値を更新してからplanします。Terraformの入力検証が旧設定を拒否します。
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

Cloudflare PagesはGit integrationを正本とし、`main`へのpushで自動deployします。
同じprojectにCDからDirect Uploadも行うと二重deployになるため併用しません。

Pages project:

| 項目 | 値 |
|---|---|
| project name | `videoq-web` |
| root directory | `/`（repository root） |
| build command | `npm ci && npm run build --workspace @videoq/web` |
| output | `apps/web/dist` |
| `VITE_API_URL` | 公開 API origin または `/api` |
| `VITE_USE_S3_STORAGE` | `true` |

Build watch pathsには `apps/web/**`、`packages/trpc/**`、ルートの`package.json`と
`package-lock.json`を含めます。production branchが`main`であることもPages dashboardで確認します。
Git integrationを使わずDirect Upload projectとして運用する場合のみ、CI成果物を次でdeployします:

```bash
cd apps/api
npx wrangler pages deploy ../web/dist \
  --project-name "$CLOUDFLARE_PAGES_PROJECT" \
  --branch main
```

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

## 7. Better Auth 初回cutover（破壊的・旧0005）

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

この節は旧認証から`0005_better_auth`へ初めて移る環境だけが対象です。すでにBetter Authを
運用している環境で、1.7へ上げるために再実行しないでください。

## 8. Better Auth 1.7 migration（Claude client再登録）

`0017_invalidate_legacy_oauth_grants`〜`0020_finalize_better_auth_issuer`は、Better Auth 1.7のresource-bound tokenへ
安全に切り替えるため、既存の外部OAuth client・consent・access token・refresh tokenを
削除します。ブラウザsession、API key、Googleログイン等の`account`は維持し、account issuerを
旧provider単位でbackfillします。MCP protected resourceはmigration SQLへ本番URLを埋め込まず、
API起動時に`BETTER_AUTH_URL`から環境別にseedします。

構造変更の`0018`と`0020`は`drizzle-kit generate`の未編集出力です。データ変更の`0017`と
`0019`だけを`drizzle-kit generate --custom`で作成しています。

適用前にbackupを取得し、account重複がないことを確認します。1行でも返った場合は
migrationを止め、原因を解消してください。

```sql
SELECT provider_id, account_id, count(*)
FROM account
GROUP BY provider_id, account_id
HAVING count(*) > 1;
```

```bash
cd apps/api
DATABASE_URL="<Neon direct connection URL>" npm run db:migrate
```

適用後はClaude Code側の旧VideoQ接続を削除し、`claude mcp add`で再登録します。
`tools/list`とread toolを確認し、write scopeを承認した接続では冪等キー付きwrite toolも
1件確認します。

## 9. リリース確認

- `/health` と `/ready`
- signup / login / logout（cookie session）
- password reset 後に既存利用者が login でき、旧 password では login できないこと
- API key 再発行と `Authorization: Bearer` / `X-API-Key` でのMCP tool呼び出し
- 旧0005 cutover時のみOAuth client再登録・SearchAPI key再入力
- R2 署名 upload と動画確定
- R2 CORS (`npm run cf:r2-cors:list --workspace @videoq/api`)
- Hyperdrive query cache disabled (`npm run cf:hyperdrive:show --workspace @videoq/api`)
- Mailgun signup verification / password reset / course invitation
- SQS enqueue と worker completion
- chat / SSE（`credentials: include`）
- tRPC query/mutation from the SPA
- OAuth discovery / DCR / PKCE
- MCP initialize / tools list / read tool / 冪等なwrite tool
- Better Auth 1.7 migration後、旧Claude Code tokenが拒否され、再登録した接続が使えること
- CloudWatch alarmの状態とSNS subscription確認

Cloudflare Workers logs と Lambda CloudWatch logs の両方を確認してください。
