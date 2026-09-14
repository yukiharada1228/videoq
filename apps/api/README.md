# apps/api

VideoQ の Web API。Hono / TypeScript を Cloudflare Workers で実行します。

## 構成

通常の JSON API は `packages/trpc` の router を正本とし、API workspace は
request context と service adapter を実装します。

```text
src/
├── app.ts                 # Hono、tRPC、raw transport の組み立て
├── index.ts               # fetch / scheduled entrypoint
├── trpc/
│   ├── context.ts         # request-scoped auth / procedure adapter
│   └── handlers/          # domain service と procedure の接続
├── features/
│   └── <domain>/
│       ├── routes.ts      # protocol 固有 HTTP endpoint のみ
│       ├── schemas.ts     # raw transport 用 Zod schema
│       └── service.ts     # use case orchestration
├── repositories/          # Drizzle / SQL による永続化
├── db/schema/modern.ts    # runtime schema の正本
├── middleware/            # auth、CORS、error handling
├── shared/                # error、pagination、日時等
└── lib/                   # JWT、password、OAuth、SQS、暗号等
```

依存方向は `tRPC router → Hono handler → service → repository` です。
input validation と procedure 名は `packages/trpc/src/routers` に集約します。

## API 契約

- endpoint: `/api/trpc`
- 一覧: `{ data: T[], meta: { total, limit, offset } }`
- error data: tRPC code、HTTP status、`applicationCode?`、`details?`
- 日時: UTC ISO-8601

Hono の raw route は Better Auth / OAuth discovery、Stripe webhook、MCP、health、
media binary、multipart upload、chat SSE、CSV export に限定します。

tRPC router の正本は [`packages/trpc`](../../packages/trpc/) にあり、
Hono は既存 service を procedure context に接続します。REST/OpenAPI の JSON API と
API reference UI は提供しません。

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
- MCP / 第三者: `@better-auth/oauth-provider`
  （MCP 向けに unauthenticated DCR を許可。register は rate limit、confidential client の secret は 30 日で失効）
- Better Auth 1.7のprotected resourceを`/api/mcp`に固定する。1.7移行時は旧DCR clientと
  tokenを失効させて再登録する。access tokenは15分、Bearer / DPoPの両方を検証する
- tRPC とブラウザ向け raw route は Cookie session、MCP は API key / OAuth Bearer を使用
- MCP OAuth は `videoq.read` / `videoq.write` を検証し、API key metadata 欠落時は read-only とする
- MCP 作成系は `mcp_idempotency_records` で30日間冪等化し、tool単位の出力schema・安全性annotation・user単位rate limitを持つ
- SPA の「ログイン済み」判定は Better Auth `useSession`。プロフィールは `account.me`
- ユーザー ID は Better Auth 標準の text UUID（既存行も `0006_user_id_uuid` で UUID に付け替え。セッション / OAuth トークンは無効化）
  - スキーマ差分は `drizzle-kit generate`（`meta/0005_snapshot.json` → `0006_snapshot.json`）
  - データ remap は履歴上のDrizzle custom migration。適用済みのため再生成・編集しない

## 秘密情報の暗号化

ユーザー固有の外部 API key は AES-256-GCM で暗号化します。

- key: `USER_SECRET_ENCRYPTION_KEY`（base64url 32 bytes）
- envelope: `v1.<nonce>.<ciphertext+tag>`
- nonce: 暗号化ごとに生成する 12 bytes

`BETTER_AUTH_SECRET`、OpenAI key、S3/SQS credential は `wrangler secret` または
ローカルの `.dev.vars` で管理します。

## QAエージェント

QAモードはReActで、アクセス確認済みの現在の講座を対象に次のツールを使います。PLOGの生成状態には依存しません。

- `get_course_info`: 講座名・登録説明・動画総数と、動画ID・タイトル・説明・掲載位置・処理状態を取得。1ページ最大20動画、1回答最大5回。説明文は講座2000文字・動画500文字で省略を明示し、続きの動画は `videos_meta.next_offset` で取得します。
- `search_scenes`: 字幕の意味検索。任意の `video_ids` で講座内の動画に絞り込めます。省略時は講座全体、講座外IDや空の指定は不正として扱います。1回答最大3回。

講座名・本数などはメタ情報だけで回答でき、この場合はベクトル検索の接続や埋め込みAPIを使いません。授業内容の説明では字幕を検索して `[N]` で引用します。メタ情報も回答評価用の `retrieved_contexts` に保存しますが、シーンの引用番号や時刻は付けません。

定義・比較・具体例・計算・要約や「何を学べる？」は内容の質問として検索を指示します。用語だけの質問も同様です。講座全体の検索では `get_course_info` を経由せず `video_ids` を省略できます。「登録されている説明文を見せて」はメタ情報の取得依頼ですが、「講座の内容を要約して」では説明文の有無にかかわらず字幕を検索します。

動画の `position` は1始まりの掲載位置、`order` は登録された並べ替え用の値です。タイトル中の「第7回」などの講義番号とは区別します。ツールを使うモデルターンは最大8回で、その後はツールを外して最終回答を生成します。ストリーム・非ストリームの両経路に対応します。

検証: `test/rag-agent.test.ts`、`test/chat-send.test.ts`、`test/workers/rag-agent.test.ts`。実PostgreSQLでのページング・権限・動画絞り込みは `QUOTA_TEST_DATABASE_URL` を指定して `test/rag-course-info.integration.test.ts` を実行します。

実モデルのツール選択は次の任意テストで検証します。`OPENAI_API_KEY`・`OPENAI_BASE_URL`・`LLM_MODEL` は環境変数、または `apps/api/.dev.vars` から読みます。LLM APIの利用料金が発生します。DBと検索結果は固定データを使い、説明文の有無、メタ情報のみ・内容・混合質問、日英、ストリーム・非ストリームを確認します。通常のCIでは実行しません。

```bash
RAG_SELECTION_LIVE=1 npm run test:unit --workspace @videoq/api -- test/rag-agent-selection.live.test.ts
```

## データベース

Drizzle の modern schema を runtime の唯一のモデルとして使用します。

主なテーブル群:

- auth (Better Auth): `users` (text UUID PK), `session`, `account`, `verification`, `apikey`, `jwks`, `oauth_*`
- video: `videos`, `video_courses`, `video_course_members`, `tags`, `video_tags`
- chat/evaluation: `chat_logs`, `chat_log_evaluations`, `course_evaluation_snapshots`
- PLOG: `plog_*`, `learner_concept_states`
- vector: `scene_embeddings`（worker・HonoともPGVectorStore。Hono検索は所有者・講座内動画のスコープを固定）

管理 procedure（superuser）: `admin.listUsers`、`admin.patch*`、`admin.reindexAll`。
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
npm run db:generate -- --name describe_the_schema_change
npm run db:check
npm run db:verify
npm run db:migrate
npm run db:studio
```

`src/db/schema/`をスキーマの正本とし、DDL migrationは必ず
`drizzle-kit generate`（上記`db:generate`）で作成します。生成されたSQL、snapshot、journalは
手で編集しません。データbackfillなどDrizzle KitがDDLとして表現できない処理だけは、
`npm run db:generate:custom -- --name describe_the_data_change`でDrizzle管理下のcustom migrationを
作成し、先頭を`-- drizzle-kit:custom`にします。custom migrationへDDLを書かず、
`drizzle-kit push`は共有環境・本番では使用しません。`db:verify`はjournalとの一対一、
生成DDLとsnapshot差分の完全一致、custom migrationにDDLがないことを検査します。

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

本番Workerは`.github/workflows/cd.yml`から、`apps/api`をWranglerの
working directoryとして`wrangler.jsonc`をdeployします。Pagesとは異なり、
Cloudflare Dashboard側にrepositoryのルートディレクトリ設定はありません。

| binding | 用途 |
|---|---|
| `HYPERDRIVE` | Neon PostgreSQL |
| `VIDEO_BUCKET` | 動画・字幕・サムネイル |
| `RATE_LIMITER` | 分散 rate limit |
| `STUDY_SESSION` | 学習モードの一時状態（Durable Object） |

R2 の S3 互換 endpoint、SQS、LLM/embedding、OAuth issuer などは
`wrangler.jsonc` と `.dev.vars.example` を参照してください。
本番の認証・招待メールは `MAILGUN_API_KEY` を必須とします。Cloudflare Email Sendingと
KVは使用しません。ローカルでメールを設定しない場合はREADMEの手順でaccountを昇格します。

本番resourceの設定を同期・確認するコマンド:

```bash
npm run cf:hyperdrive:disable-cache
npm run cf:hyperdrive:show
npm run cf:r2-cors:apply
npm run cf:r2-cors:list
```

R2 CORSの正本は `r2-cors.production.json` です。更新操作には通常のWorker deploy tokenとは
分離した、Hyperdriveと対象R2 bucketだけを管理できるtokenを使います。

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
