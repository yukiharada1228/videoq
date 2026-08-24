# apps/api

VideoQ の Web API。Hono / TypeScript を Cloudflare Workers で実行します。

## 構成

`OpenAPIHono` をルートの正本とし、ドメインごとに次の責務へ分けています。

```text
src/
├── app.ts                 # OpenAPIHono の組み立て
├── index.ts               # fetch / scheduled entrypoint
├── features/
│   └── <domain>/
│       ├── routes.ts      # createRoute、middleware、HTTP 入出力
│       ├── schemas.ts     # Zod / OpenAPI schema
│       └── service.ts     # use case orchestration
├── repositories/          # Drizzle / SQL による永続化
├── db/schema/modern.ts    # runtime schema の正本
├── middleware/            # auth、CORS、error handling
├── shared/                # error、pagination、OpenAPI、日時等
└── lib/                   # JWT、password、OAuth、SQS、暗号等
```

依存方向は `routes → service → repository` です。HTTP schema は
`createRoute` から OpenAPI へ反映されます。

## API 契約

- 一覧: `{ data: T[], meta: { total, limit, offset } }`
- 単体: `{ data: T }`
- エラー: `{ error: { code, message, details? } }`
- 日時: UTC ISO-8601
- URL: trailing slashなし
- OpenAPI JSON: `/api/openapi.json`
- Scalar UI: `/api/docs`
- ReDoc: `/api/redoc`

SSE、OAuth token response、OpenAI 互換 endpoint など、外部仕様で形が決まるものは例外です。

## 認証

Better Auth（`/api/auth/*`）が正本です。

### ブラウザセッション

- Cookie session（Better Auth）。SPA は `credentials: "include"` + `better-auth/react`
- メール確認・パスワード再設定・メール変更は Better Auth verification フロー
- 秘密鍵: `BETTER_AUTH_SECRET` / 公開 URL: `BETTER_AUTH_URL`
- Google ログイン（任意）: `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`  
  Redirect URI: `{BETTER_AUTH_URL}/api/auth/callback/google`

### API key / OAuth

- API key: `@better-auth/api-key`（prefix `vq_`、access level は metadata）
- MCP / 第三者: `@better-auth/oauth-provider` + device authorization  
  （MCP 向けに unauthenticated DCR を許可。register は rate limit、confidential client の secret は 30 日で失効）
- ドメイン API は session / API key / OAuth Bearer を `middleware/auth.ts` で解決
- SPA の「ログイン済み」判定は Better Auth `useSession`。プロフィールは `/api/account/me`
- ユーザー ID は Better Auth 標準の text UUID（既存行も `0006_user_id_uuid` で UUID に付け替え。セッション / OAuth トークンは無効化）
  - スキーマ差分は `drizzle-kit generate`（`meta/0005_snapshot.json` → `0006_snapshot.json`）
  - データ remap は custom SQL（再生成: `npm run db:generate:user-id-uuid`）

## 秘密情報の暗号化

ユーザー固有の外部 API key は AES-256-GCM で暗号化します。

- key: `USER_SECRET_ENCRYPTION_KEY`（base64url 32 bytes）
- envelope: `v1.<nonce>.<ciphertext+tag>`
- nonce: 暗号化ごとに生成する 12 bytes

`BETTER_AUTH_SECRET`、OpenAI key、S3/SQS credential は `wrangler secret` または
ローカルの `.dev.vars` で管理します。

## データベース

Drizzle の modern schema を runtime の唯一のモデルとして使用します。

主なテーブル群:

- auth (Better Auth): `users` (text UUID PK), `session`, `account`, `verification`, `apikey`, `jwks`, `device_code`, `oauth_*`
- video: `videos`, `video_courses`, `video_course_members`, `tags`, `video_tags`
- chat/evaluation: `chat_logs`, `chat_log_evaluations`, `course_evaluation_snapshots`
- PLOG: `plog_*`, `learner_concept_states`
- vector: `scene_embeddings`（workerはPGVectorStore、Hono検索は認可列付き直接SQL）

管理 API（superuser）: `GET/PATCH /api/admin/users*`, `POST /api/admin/embeddings/reindex-all`。  
フロントの `/admin` 画面から利用します。

最初のスーパーユーザーは既存アカウントを昇格させます（ユーザー名・メールどちらでも可）:

```bash
npm run user:superuser -- alice
```

ローカルでログイン／登録のレート制限に当たったときは、RateLimiter DO 状態を消して API を再起動します:

```bash
npm run rate-limit:reset
```

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

## 非同期ジョブ

SQS message は native JSON です。

```json
{
  "type": "transcribe_video",
  "job_id": "uuid",
  "payload": { "video_id": 123 }
}
```

consumer は [`apps/worker/`](../worker/) です。ローカルでは ElasticMQ、本番では Amazon SQS を使います。

ジョブ投入と業務データ更新は `external_tasks` outbox に同一transactionで保存し、通常はその場で
SQSへ配送します。`*/5 * * * *` のcronは、DB commit直後のプロセス停止やSQS障害で残った行と
放棄uploadを回収するための安全網です。通常配送の代わりではないため、削除すると障害時に
永続的な取りこぼしが生じます。48回失敗した行は `dead_at` を設定して停止し、構造化ログで通知します。

`17 3 * * *`（UTC）では、SQSの最大保持期間より長い30日を過ぎた完了済みoutbox／実行台帳を
小分けで削除します。未完了outboxが参照中の実行台帳は削除しません。

## Cloudflare bindings

| binding | 用途 |
|---|---|
| `HYPERDRIVE` | Neon PostgreSQL |
| `VIDEO_BUCKET` | 動画・字幕・サムネイル |
| `RATE_LIMITER` | 分散 rate limit |
| `STUDY_SESSION` | 学習モードの一時状態（Durable Object） |
| `EMAIL` | 認証メール |

R2 の S3 互換 endpoint、SQS、LLM/embedding、OAuth issuer などは
`wrangler.jsonc` と `.dev.vars.example` を参照してください。

## 開発

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run cf-typegen
```

ローカル依存サービスをまとめて起動する場合:

```bash
docker compose up -d postgres minio minio-init elasticmq worker
```
