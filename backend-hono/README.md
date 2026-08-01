# backend-hono

VideoQ の Web バックエンドを Cloudflare Workers（Hono / TypeScript）へ段階移行するプロジェクト。
公式 `npm create hono@latest`（`cloudflare-workers` テンプレート）で生成し、移行要件に合わせて構造化。

- 設計: [docs/architecture/cloudflare-hono-migration-requirements.md](../docs/architecture/cloudflare-hono-migration-requirements.md)
- 実証 PoC: [docs/architecture/poc-01〜04](../docs/architecture/)

## 現状（Phase 0）

ストラングラーフィグ移行の基盤:

- Hono ルーター + 共通ミドルウェア（requestId / 構造化ログ / CORS / エラーハンドラ）
- `GET /health`（liveness）/ `GET /ready`（Hyperdrive 経由で Neon 疎通）
- Hyperdrive 経由の Neon 接続（**Client はリクエストごとに生成** — 要件 §11.4 / PoC #01d）
- R2 バインディング（`VIDEO_BUCKET`）
- **未移行ルートは `LEGACY_API_ORIGIN`（既存 Django）へプロキシ**（Cookie/CSRF/クエリ/ボディ/ヘッダ + Set-Cookie 透過）

移行済みルートは `src/app.ts` のプロキシより前に登録する。未登録の同 prefix（例 `/api/auth/login`）はプロキシで Django に流れる。

### 移行済みルート
| ルート | 認証 | 備考 |
|---|---|---|
| `GET /api/auth/me` | **API キー + Cookie/Bearer JWT** | Django `MeView` と完全契約互換。`UserSerializer` と同形の**生 JSON**（統一封筒は使わない） |
| `GET /api/videos/groups/` | API キー + Cookie/Bearer JWT | `VideoGroupListView` と完全契約互換。**実 DRF シリアライザとバイト一致**（§13.3）。limit/offset ページネーション、datetime は America/Chicago オフセット + マイクロ秒 |
| `GET /api/videos/` | API キー + Cookie/Bearer JWT | `VideoListView` と完全契約互換。**実 DRF シリアライザとバイト一致**。q/status/ordering/tags フィルタ、`file` は **R2 presigned GET URL**（youtube 等は null）、`tags`（名前順）、`youtube_embed_url` |
| `GET /api/videos/:id/` | API キー + Cookie/Bearer JWT | `VideoDetailView` と完全契約互換（**実 DRF とバイト一致**）。一覧 + `user`/`transcript`/`error_message`。id は数値のみ（`:id{[0-9]+}`）で `groups` 等はプロキシへ。未所有/不在は `{"error":{"code":"VALIDATION_ERROR","message":"Video not found"}}` の 404 |
| `GET /api/chat/groups/:id/history/` | API キー + Cookie/Bearer JWT | `ChatGroupHistoryView` と完全契約互換（**実 DRF とバイト一致**）。limit/offset ページネーション、`citations`（1 始まり index の id）、`created_at` は America/Chicago。所有者のみ（未所有/不在は 404 `Group not found.`）。`?download=csv` は Django へプロキシ委譲 |

> **契約テスト（§13.3）で datetime の罠を回避**: DRF `DateTimeField` は `settings.TIME_ZONE`（America/Chicago）へ変換して出力する（UTC/Z ではない）。実 DRF シリアライザの出力と Worker のレスポンスをバイト比較して確定。`src/utils/datetime.ts` 参照。

> **`file` の presigned URL（メディア共通基盤, `src/integrations/media.ts`）**: 本番(R2)の `file` は django-storages の presigned GET URL。aws4fetch(SigV4) で path-style `https://<account>.r2.cloudflarestorage.com/<bucket>/media/<key>?X-Amz-...&X-Amz-Expires=3600` を生成（region=`auto`、codex が実 `default_storage.url()` で構造検証済み）。**R2 の S3 認証情報が必要**（`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_S3_ENDPOINT` / `R2_BUCKET_NAME` の secret/var）。
> **機能検証済み**: ローカル MinIO（S3 互換）にオブジェクトを置き、Worker が生成した presigned URL を実 GET → **HTTP 200 + 内容一致**。URL は path-style・`media/` 前置・boto3 と同一のクエリ集合（X-Amz-Algorithm/Credential/Date/Expires/SignedHeaders/Signature）を確認。

> **ルーティングの教訓**: サブアプリの root `/` ルートを prefix にマウント（`app.route("/api/videos", sub)` + `sub.get("/")`）すると**末尾スラッシュ `/api/videos/` にマッチしない**。フルパスで定義し `app.route("/", sub)` でマウントする（`health`/`videos`/`groups` はこの形）。

### 認証（`src/middleware/auth.ts`）
`requireAuth(...methods)` で DRF の `authentication_classes` と同順に方式を試す合成ミドルウェア。各方式は `absent`（次へ）/ `invalid`（401 で打ち切り）/ `ok` を返す。

| 方式 | 提示 | 実装 |
|---|---|---|
| `apiKeyMethod` | `X-API-Key: vq_...` / `Authorization: ApiKey vq_...` | WebCrypto SHA-256 → `app_userapikey`（`revoked_at IS NULL` + `user.is_active`）照合、`last_used_at` 更新（PoC #03） |
| `jwtMethod` | `Authorization: Bearer <jwt>` / Cookie `access_token` | `jose` で HS256 検証（`token_type=access`）。`JWT_SECRET` は Django `SECRET_KEY` と一致必須 |

`/api/auth/me` = `requireAuth(apiKeyMethod, jwtMethod)`（MeView と同順）。401 は DRF 互換の `{ detail }`。
OAuth / Share 方式は MCP・共有グループ用ルートで追加予定（/me は受理しないので未適用）。

## ディレクトリ構成

```
src/
├─ index.ts              # エントリ（fetch ハンドラ）
├─ app.ts                # Hono 組み立て + ミドルウェア/ルート配線
├─ types/bindings.ts     # Bindings / Variables（型は一元管理）
├─ middleware/           # request-id / logger / cors / error-handler
├─ routes/
│  ├─ health.ts          # /health /ready
│  └─ proxy.ts           # 未移行→Django プロキシ（ストラングラーフィグ）
├─ db/pool.ts            # Hyperdrive 経由 pg（per-request Client）
└─ utils/                # responses（統一封筒）/ errors（AppError）
test/                    # vitest スモークテスト
```

## 開発

```bash
npm run dev         # wrangler dev（ローカル）
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
npm run cf-typegen  # wrangler types（バインディング型の再生成）
```

### ローカルで /ready・プロキシを試す
- `/ready` は `wrangler.jsonc` の Hyperdrive `localConnectionString` が指す Postgres に接続する。
  ローカル docker の `videoq-postgres` を使う場合は、ホストのポートへ転送する（例: socat で 55432→5432）。
- プロキシは `LEGACY_API_ORIGIN`（既定 `http://localhost:8000`）へ転送する。ローカル Django を起動しておく。

## バインディング（`wrangler.jsonc`）

| 種別 | binding | 用途 |
|---|---|---|
| Hyperdrive | `HYPERDRIVE` | Neon への接続（本番は `wrangler hyperdrive create` の id を設定） |
| R2 | `VIDEO_BUCKET` | 動画・字幕・サムネイル |
| vars | `ENVIRONMENT` / `LEGACY_API_ORIGIN` / `CORS_ALLOW_ORIGIN` | 非機密設定 |

機密（JWT 鍵・OpenAI 等）は `wrangler secret` / `.dev.vars`（`.dev.vars.example` 参照）。

## 次のフェーズ（要件 §13）

- Phase 1: 認証ミドルウェア（Cookie JWT / API キー / OAuth / Share, PoC #03）+ 読み取り系ルート
- Phase 2: RAG 検索（直接 SQL, PoC #01）+ チャット SSE
- Phase 4: ジョブ投入（Worker→SQS, PoC #02）+ 冪等性（JR-2 設計書）
