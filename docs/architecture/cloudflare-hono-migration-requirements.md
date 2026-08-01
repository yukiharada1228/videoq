# VideoQ バックエンド Cloudflare Workers / Hono 移行 要件定義書

- 文書種別: 要件定義書（移行プロジェクト）
- 対象: VideoQ Web バックエンド（`backend/`）
- 作成日: 2026-08-01
- 版: 1.2（現行コードベース `main` に整合。codex 独立レビューによる実コード照合で §2/§6/§8/§9/§11 を是正）
- 関連文書: [Cloudflare 全面移行 技術実現可能性レポート](./cloudflare-hono-migration-study.md) / [codex 独立レビュー記録](./cloudflare-hono-migration-requirements-review-codex.md)

> **v1.2 是正サマリ（codex 実コードレビュー反映）**: (1) pgvector は langchain-postgres **v2 API**、テーブル名＝`videoq_scenes`、`user_id`/`video_id` は**独立 INTEGER 列**（`langchain_pg_*` は誤り）。(2) `Video.status` = `uploading/pending/processing/indexing/completed/error`（`failed` は誤り）。(3) SimpleJWT **ブラックリストは未導入**（失効は no-op）— AU-1 は現行互換でなく新規要件。(4) 認証は **Share(slug) を含め主要4経路**、MCP は **OAuth2/Bearer APIキー/X-API-Key の3方式**。(5) LangChain.js 標準フィルタは現行スキーマと**非互換**、直接 SQL を第一候補に。(6) ジョブ投入の最終形は **方式C 推奨**（既存 Lambda が既に独自アダプタのため）。(7) quota ドメインを要件に追加。

> 本書は、ChatGPT と作成した「実装計画書」を土台に、**現行コードベースの実装事実へ突き合わせて是正・拡充**した要件定義書である。計画書に対する主要な是正点は「§2 現行アーキテクチャと計画書との差分」に集約している。

---

## 1. 背景・目的

### 1.1 背景

現行 VideoQ の Web バックエンドは Django 5.2 + DRF（クリーンアーキテクチャ, 約46,500 LOC）で実装され、AWS Lambda（API Gateway HTTP API 経由）で稼働している。動画変換・文字起こし・Embedding 生成・pgvector 保存などの重量処理は、Celery ワーカー（別 Lambda, SQS ブローカー）が担う。フロントエンドは既に Cloudflare Pages 上にある。

### 1.2 目的

Web API 層を **Cloudflare Workers + Hono（TypeScript）** へ段階移行し、Django API Lambda / API Gateway / API 用 CloudFront を廃止する。RAG・チャットの検索側を **LangChain.js** へ移行し、Neon PostgreSQL へは **Hyperdrive** 経由で接続する。**重量処理（FFmpeg・文字起こし・大量 Embedding・pgvector 一括保存）は既存の Python Worker Lambda を継続利用**する。

### 1.3 移行しないもの（明確な非目標）

- Worker Lambda（Python）による動画処理パイプラインの実装言語変更（Whisper/FFmpeg 経路は据え置き）
- pgvector の保存側（書き込み）ロジックの TypeScript 化（初期は Python 側のみが書き込む）
- Neon PostgreSQL・Cloudflare R2・Amazon SQS の置き換え（いずれも継続利用）
- フロントエンド（Cloudflare Pages, 変更なし）

---

## 2. 現行アーキテクチャと計画書との差分（是正事項）

要件を確定する前提として、実装計画書の記述と**現行コードの実装事実が食い違う点**を以下に是正する。要件はすべて「是正後」を正とする。

| # | 論点 | 計画書の記述 | 現行実装の事実（是正） | 影響 |
|---|---|---|---|---|
| D1 | 認証方式 | JWT（Bearer 前提） | ブラウザは **HttpOnly Cookie JWT（`CookieJWTAuthentication`）+ CSRF ダブルサブミット**。加えて **API キー**（`UserApiKey`）、**OAuth2 認可サーバ**（django-oauth-toolkit）、**Share 認証**（`share_slug`/`share_token` をクエリで受ける, `permissions.py:14`）の**主要4経路**。MCP は OAuth2 / Bearer APIキー / X-API-Key の3方式を受理（`mcp/views.py:45`） | 認証移行が計画書より大幅に複雑。§8 で再定義 |
| D2 | 非同期連携 | Workers → SQS へ raw JSON を `SendMessage` | **Celery over SQS**（`sqs://`, queue `videoq-worker`, `predefined_queues`）。ただし消費側は通常の Celery worker ではなく、**Celery エンベロープを部分解釈して `task.apply()` で同期実行する独自 Lambda アダプタ**（`lambda_handler.py`）。必要なのは `headers.task` / `headers.id` / base64 内側 body のみ | ジョブ投入方式の設計が最重要論点。§9 で再定義 |
| D3 | ベクトルストア | テーブル `video_chunks`, 列 `content/embedding/langchain_metadata` | **langchain-postgres v2 API（`PGVectorStore`/`PGEngine`）**。**コレクション名＝物理テーブル名 `videoq_scenes`**（`vector_store.py:77,97`）。`user_id`/`video_id` は **JSON ではなく独立 INTEGER 列**（`metadata_columns`）。テーブルは Django migration ではなく**ランタイム自動作成**。`langchain_pg_collection`/`langchain_pg_embedding` は使用しない | 互換設定は §6.3 の実値に従う。**§2 初版の記述は誤り** |
| D4 | API 範囲 | auth / groups / videos / chat の約20ルート | 実際は **auth・chat・videos・plog・evaluation・mcp・oauth・OpenAI互換(`/api/v1/`)・admin・schema** の広範囲（§3 参照） | スコープ・工数が計画書想定より大 |
| D5 | 欠落機能 | 記載なし | **OpenAI互換API・MCPサーバ・Plog(学習グラフ)・評価(ragas)・分析/キーワード(janome)・YouTube取込・メール系フロー・タグ・アカウント削除(非同期)・Django Admin** | いずれもスコープ判断が必要（§3） |
| D6 | Embedding 生成 | Workers 側で質問 Embedding 生成 | 生成自体は OpenAI API 呼び出しで TS 移植可能。シーン分割（Otsu 法, `scene_otsu`）は**最悪計算量 O(T²×1536)**（偏った再帰分割時。均衡分割ならより小）で重い | 検索は移行可、分割ロジックの移設可否は要 PoC |
| D7 | アップロードサイズ検証 | `confirm` で検証 | 実サイズ検証はユーザー別上限（`user.get_max_upload_size_bytes()`）で**文字起こし起動時**に実施（`run_transcription.py:117`）。署名付き PUT は content-length-range 非対応 | R2 側ガード方針を §7.1 で定義 |
| D8 | Video ステータス | （記載なし） | 実際の列挙値は **`uploading/pending/processing/indexing/completed/error`**（`models/video.py:28`）。**`failed` は存在しない**。§6.2 で修正 | ステータス互換に影響 |
| D9 | JWT 失効 | ブラックリストで失効検証 | `token_blacklist` は **INSTALLED_APPS に未登録**、`BLACKLIST_AFTER_ROTATION=False`、失効処理は**空実装**（`simplejwt_gateway.py:43`）。issuer/audience の明示設定もなし | AU-1 は現行互換でなく**新規要件**。§8.1 で分離 |
| D10 | スコープ整合 | — | 本要件定義書（Lambda 残置）と技術検討レポート フェーズ4/5（Containers/Workers AI Whisper への全面移行）が**矛盾**。**本書を正とし、レポートの全面移行部分は「将来構想」として実装ゲート外**とする | §3.3 に明記 |

---

## 3. スコープ（移行対象・維持対象・廃止対象）

### 3.1 現行 API 棚卸し（ルートベース, `backend/videoq/urls.py` 準拠）

| プレフィックス | 主なエンドポイント | 認証 | 移行区分 |
|---|---|---|---|
| `/api/auth/` | signup, session(login), refresh, me, csrf-token, account-delete, email-verification, password-reset(request/confirm), email-change(request/confirm), api-keys(list/create/detail), search-api-key | Cookie JWT / Public | **移行（Workers）** |
| `/api/videos/` | 一覧, youtube 取込, uploads(署名URL発行), 詳細/更新/削除, グループ CRUD・並び替え・メンバ操作 | Cookie JWT / APIキー | **移行（Workers）** |
| `/api/videos/<id>/plog/` | graph, rebuild(非同期), concepts CRUD・merge, learning-object, edges, learner-state | Cookie JWT | **移行（Workers）＋一部非同期は Lambda 維持** |
| `/api/chat/` | messages, **messages/stream(SSE)**, groups/<id>/history, logs/<id>/feedback, groups/<id>/analytics, analytics/keywords | Cookie JWT / APIキー | **移行（Workers）** |
| `/api/evaluation/` | groups/<id>/summary, groups/<id>/logs | Cookie JWT | **移行（Workers, 参照系のみ）／評価計算(ragas)は Lambda 維持** |
| `/api/v1/` | OpenAI 互換 API（chat completions 等） | **APIキー** | **移行（Workers）** |
| `/api/mcp` `/api/mcp/` | MCP エンドポイント | **OAuth2 Bearer** | **移行（Workers）** |
| `/api/oauth/` | authorize（同意画面）, tokens(list/revoke) | Cookie JWT + OAuth2 | **移行（Workers, 要 OAuth プロバイダ実装）** |
| `/api/health/` | ヘルスチェック | Public | **移行（Workers）** |
| `/api/admin/` | Django Admin | Django セッション | **要判断（Workers 等価物なし, §16）** |
| `/api/schema/` `/api/redoc/` | OpenAPI スキーマ / ReDoc | Public | 移行（`@hono/zod-openapi` で再生成） |

### 3.2 Workers へ移行する機能

REST API 全般、3系統の認証・認可、ユーザー/グループ/動画/タグのメタデータ管理、動画一覧・詳細・ステータス取得、チャット履歴、**質問 Embedding 生成 → pgvector 検索 → RAG → LLM 回答生成（LangChain.js）**、R2 アクセス（署名 URL 発行・取得・削除）、**非同期ジョブ投入（Celery/SQS 互換, §9）**、入力検証（Zod）、エラーハンドリング、ロギング、CORS 制御、OpenAI 互換 API、MCP、OAuth 認可サーバ、参照系の Plog/評価 API。

### 3.3 Worker Lambda（Python）に残す機能

動画取得、FFmpeg 処理、音声抽出、動画変換、サムネイル生成、文字起こし（Whisper）、字幕分割・チャンク化、**大量 Embedding 生成**、**pgvector への一括保存（langchain-postgres）**、Plog グラフ構築（`build_plog`）、チャットログ評価（`ragas`）、アカウント削除（`delete_account_data`）、再インデックス（`reindex_*`）、動画処理状態更新、SQS 再試行。

> **スコープ整合（D10）**: 技術検討レポートのフェーズ4/5は、これらの重量処理を将来的に Cloudflare Queues/Workflows・Containers・Workers AI Whisper へ全面移行する構想を含むが、**本移行のスコープ外（将来構想）**とする。本要件定義書（Lambda 残置）を実装の正とする。

### 3.4 廃止対象（移行完了後）

API 用 CloudFront / API Gateway / Django API Lambda / Lambda Web Adapter / Django Web API デプロイ設定。**SQS・Worker Lambda・Neon・R2 は継続利用。**

---

## 4. 移行後アーキテクチャ（目標構成）

```
Cloudflare Pages (Frontend, 既存)
        │
        ▼
Cloudflare Workers ── Hono
   ├─ 認証・認可（Cookie JWT / APIキー / OAuth2 Bearer）
   ├─ REST API（Zod 検証, OpenAPI）
   ├─ RAG・チャット（LangChain.js: 検索・LLM 回答）
   ├─ R2 Binding（署名URL発行・取得・削除）
   ├─ ジョブ投入（Celery/SQS 互換, §9）
   └─ Hyperdrive ─▶ Neon PostgreSQL（業務データ + pgvector[読取]）
        │
        ▼ (SQS)
Amazon SQS ─▶ Worker Lambda (Python, 既存)
   ├─ FFmpeg / Whisper / チャンク化
   ├─ Embedding 生成
   └─ langchain-postgres PGVector（pgvector[書込]）
```

初期段階では **pgvector への書き込みは Python Worker Lambda のみ**、**Workers 側は読み取り（検索）専用**とする。

---

## 5. 機能要件（ドメイン別）

各要件は「Django 版と機能等価であること」を原則とし、レスポンス互換は §13.3 の契約テストで担保する。

### 5.1 認証・アカウント（`/api/auth/`）
- FR-A1: サインアップ、ログイン（session）、ログアウト、トークンリフレッシュを提供する。トークンは **HttpOnly Cookie** で発行・更新する。
- FR-A2: CSRF トークン発行（`csrf-token`）と、非安全メソッドに対する CSRF 検証を提供する。
- FR-A3: `me`（自己情報取得）を提供する。
- FR-A4: メール確認、パスワードリセット（申請/確定）、メールアドレス変更（申請/確定）を提供する（メール送信は §7.4）。
- FR-A5: API キーの発行・一覧・削除（`UserApiKey`, ハッシュ保存, `AccessLevel`）、SearchAPI キー登録を提供する。
- FR-A6: アカウント削除を受け付け、**非同期ジョブ（`delete_account_data`）を投入**する。

### 5.2 動画・グループ・タグ（`/api/videos/`）
- FR-V1: 動画の一覧・詳細・更新・削除。削除は R2・pgvector・チャット履歴・レコードを整合的に処理する（§15.3 手順）。
- FR-V2: **署名付きアップロード URL 発行**（`uploads/`）→ ブラウザ直 PUT → 確定（`UPLOADING→PENDING`）→ 処理ジョブ投入。
- FR-V3: YouTube 取込（SearchAPI 利用, `source_type=youtube`）。
- FR-V4: グループ CRUD、並び替え、グループ-動画メンバ操作。
- FR-V5: 動画ステータス取得（`uploading/pending/processing/completed/failed`）。
- FR-V6: タグ CRUD と動画へのタグ付け。

### 5.3 チャット・RAG（`/api/chat/`, `/api/v1/`）
- FR-C1: 質問受付 → アクセス権確認 → 質問 Embedding 生成 → **pgvector 検索（LangChain.js）** → Top-K 取得 → プロンプト生成 → LLM 回答 → 引用・タイムスタンプ付与 → 履歴保存。
- FR-C2: **SSE ストリーミング応答**（`messages/stream/`）。エッジのアイドルタイムアウト（約100秒）対策として **15〜30秒間隔のキープアライブ（`:ping`）を送出**する。
- FR-C3: グループ単位のチャット履歴取得、回答フィードバック登録（`FeedbackChoices`）。
- FR-C4: グループ分析・キーワード分析（janome 依存の日本語形態素解析は §10.2 の方針で扱う）。
- FR-C5: OpenAI 互換 API（`/api/v1/`）を **API キー認証**で提供する。**現行は限定互換**（`temperature`/`max_tokens`/`top_p`/`stream` は受理するが無視、`usage` は常に 0、`stream=true` でも非ストリーミング — `serializers.py:25`, `views.py:592`）。「現行の限定互換を忠実移植」か「OpenAI SDK 互換を改善」かを契約として分離して決める。

### 5.4 Plog（学習グラフ, `/api/videos/<id>/plog/`）
- FR-P1: グラフ取得、概念/エッジ/学習オブジェクトの参照・編集、概念マージ、学習者状態取得。
- FR-P2: グラフ再構築（`rebuild`）は **非同期ジョブ（`build_plog`）を投入**する（LLM 抽出・埋め込みは Lambda 側）。

### 5.5 評価（`/api/evaluation/`）
- FR-E1: グループ評価サマリ・ログの**参照系**を Workers で提供する。
- FR-E2: 評価計算（ragas: Faithfulness / ResponseRelevancy / LLMContextPrecision）は **Lambda 側で継続**し、Workers は結果参照とジョブ投入のみ。

### 5.7 利用枠（quota）— 中核ドメイン（初版で欠落, 追加）
- FR-Q1: 利用上限・使用量は `User` に直接保存され、**新規ユーザーの既定値は 0**（`models/user.py:25`）。CRUD として単純移植すると無料利用・二重課金が発生するため、以下の実装挙動を保持する。
- FR-Q2（**PoC #04 で Worker 移行を実測確認**）: ストレージ予約は**条件付き UPDATE で競合を防ぐ**（`django_subscription_repository.py:57`）。署名 URL 発行時に**申告サイズを先取り予約**する。→ 生 SQL の単一条件付き UPDATE（`used+size<=limit` + `RETURNING`）で Worker から実装でき、20/30 並行でも超過予約ゼロを実測（[PoC #04](./poc-04-quota-upload-race.md)）。`transaction.atomic()` 依存は不要。
- FR-Q3（**現行ギャップ・新規実装**）: アップロード放棄時の**自動解放が現行に無い**（先取り予約が残る）。confirm 失敗/タイムアウト解放 or R2 未着 reconciliation cron で `GREATEST(0, used-size)` 解放を新規実装（PoC #04 で解放クランプの安全性を確認）。
- FR-Q4: AI 回答使用量の記録失敗は現行では握り潰される（`send_message.py:220`）。移植時の扱い（ベストエフォート/補償）を定義する。
- FR-Q5: 月次リセットは**アクセス時の遅延処理**。この方式を保持するか cron 化するかを決める。
- 注: 過去に Stripe 連携（Subscription 列）が追加されたが後続 migration で削除済み。**現行に Stripe ルート/SDK/Webhook は無い**。quota を Stripe 課金と誤認して省略しないこと。

### 5.8 MCP / OAuth（`/api/mcp`, `/api/oauth/`）
- FR-M1: MCP エンドポイントを **OAuth2 Bearer** で保護して提供する（既存の list_videos / get_video / list_groups 等のツール互換）。
- FR-M2: OAuth2 認可サーバ機能（authorize 同意画面・トークン発行・トークン一覧/失効）を提供する。既存クライアント（claude.ai / Claude Desktop の Remote MCP コネクタ）とのビット互換を維持する。

---

## 6. データ要件

### 6.1 データストア
Neon PostgreSQL を継続利用し、Workers からは **Hyperdrive 経由**で接続する（直接接続文字列は使用しない）。スキーマ変更・データ移行は原則行わない（同一 DB を Django/Workers/Lambda が共有）。

### 6.2 主要テーブル（`backend/app/infrastructure/models/`）
User（Django 標準）, Video, VideoGroup, VideoGroupMember, Tag, VideoTag, ChatLog, ChatLogEvaluation, UserApiKey, AccountDeletionRequest, Plog 系（PlogBuildJob, PlogSummaryNode, PlogConcept, PlogEdge, PlogLearningObject, LearnerConceptState）, django-oauth-toolkit 系テーブル, simplejwt 系（ブラックリスト等）。
- 列挙値: Video.status = `uploading/pending/processing/indexing/completed/error`（既定 `pending`, `error` 時は `error_message` に理由）、Video.source_type = `uploaded/youtube`。

### 6.3 pgvector 互換要件（Python ↔ LangChain.js）

現行は langchain-postgres の **v2 API**（`PGVectorStore` / `PGEngine`, `vector_store.py`）。**コレクション名がそのまま物理テーブル名**になる。テーブルは Django migration ではなく**ランタイムで自動作成**され、migration が作るのは pgvector extension と Django cache table のみ（`migrations/0020_*`）。実スキーマ:

```text
public.videoq_scenes
  langchain_id        UUID PRIMARY KEY
  content             TEXT NOT NULL
  embedding           vector(1536) NOT NULL
  user_id             INTEGER          -- 独立列（JSON ではない）
  video_id            INTEGER          -- 独立列（JSON ではない）
  langchain_metadata  JSON             -- title / start / end / scene index 等（user_id/video_id は含まない）
```

| 項目 | 現行値 |
|---|---|
| テーブル名（＝コレクション名） | `videoq_scenes`（`PGVECTOR_COLLECTION_NAME`） |
| ID 列 | `langchain_id`（UUID） / 本文列 `content` / ベクトル列 `embedding` / メタ列 `langchain_metadata` |
| メタデータ列（独立） | `user_id`, `video_id`（INTEGER, `metadata_columns` 指定） |
| Embedding モデル | `EMBEDDING_MODEL`（既定 `text-embedding-3-small`） |
| 次元数 | `EMBEDDING_VECTOR_SIZE = 1536` |
| 距離方式 | cosine |
| インデックス | リポジトリに HNSW/IVFFlat 定義**なし** → 実 DB の `pg_indexes` を PoC で要確認 |

- DR-1: **初期段階、Workers から当該ベクトルテーブルへの書き込み・スキーマ変更・インデックス変更・自動テーブル作成を禁止**する。
- DR-2: Workers 側は Python 側と異なる Embedding モデル・次元数・距離方式を用いてはならない。
- DR-3: **`group_id` / 削除フラグ / 処理完了フラグはベクトル行に保存されていない**。現行は先に Postgres の Video/Group テーブルから「認可済み・`completed`（indexing 済）動画 ID 群」を解決し、独立列 `user_id` と `video_id IN (...)` でベクトル検索する（`rag_service.py:153`）。要件は**(1) 関係 DB で先に動画 ID を解決してからベクトル検索、または (2) ベクトル SQL で Video/Group を JOIN** とする（保存側スキーマ変更＝DR-1 と矛盾するため不可）。
- DR-4（**PoC #01 実測で確定, 2026-08-01**）: **LangChain.js 標準の `buildFilterClauses()` は `langchain_metadata ->> 'user_id'` の形で JSON にフィルタを掛けるが、現行は `user_id`/`video_id` を独立列に持ち JSON メタには含まない**（ローカル実 DB 289 行で `meta_has_user=f` を確認）。標準 PGVector フィルタでは **RAG 検索が全クエリ 0 件**になる。→ **検索は Repository 層の直接 SQL を本線とする（確定）**。標準 PGVector のメタデータフィルタは不採用。実証は [PoC #01 §6.5](./poc-01-pgvector-cross-runtime-search.md) 参照。
  - 補足: 埋め込み次元は環境依存（ローカル Ollama=1024, 本番 OpenAI=1536）。**ベクトルインデックスが現状存在しない**（pkey のみ）ため、本番規模では HNSW 追加が必須。
  - **実 Workers ランタイムで実装可能と確定（PoC #01b, 2026-08-01）**: `workerd`（`wrangler dev`）+ `nodejs_compat` + `pg`（per-request `Client`）+ Hyperdrive で直接 SQL の pgvector 検索を実行し、psql と数値一致・認可フィルタも Worker 上で機能（[PoC #01 §6.6](./poc-01-pgvector-cross-runtime-search.md)）。→ LangChain.js 標準ストアに依存せず、直接 SQL を独自 Retriever でラップする方針が実行可能。
  - **本番 Hyperdrive + 実 Neon(1536 次元) で実測合格（PoC #01d, 2026-08-01）**: `wrangler dev --remote` から本番 Neon(1,762 行)へ直接 SQL 検索。認可漏れ 0、warm クエリ **P50=3ms / P95=4ms**（cold 初回 ≈462ms）、**20 並列 20/20 成功・stale connection エラー 0**。データ層の残課題なし（[PoC #01 §6.8](./poc-01-pgvector-cross-runtime-search.md)）。本番も HNSW 無しのためデータ増時に追加推奨。
  ```sql
  SELECT content, langchain_metadata, user_id, video_id,
         embedding <=> $1::vector AS distance
  FROM videoq_scenes
  WHERE user_id = $2 AND video_id = ANY($3::int[])
  ORDER BY embedding <=> $1::vector
  LIMIT 20;
  ```

---

## 7. 外部インターフェース要件

### 7.1 Cloudflare R2
- IR-R1: Workers から R2 へは **R2 Binding** を使用（取得・存在確認・削除・メタデータ・ダウンロード応答）。
- IR-R2: 大容量動画は Workers メモリへ展開しない。**署名付き PUT URL によるブラウザ直アップロード**を維持する。
- IR-R3: 署名付き PUT は content-length-range を強制できないため、**サイズ上限ガードは R2 イベント通知または処理起動時のサイズ検証**で担保する（ユーザー別上限）。
- IR-R4: R2 オブジェクトキーはユーザー入力から直接生成しない（既存 `_build_s3_key` 相当のキー規則を踏襲）。

### 7.2 Amazon SQS / Celery（§9 で詳細化）
- IR-Q1: Workers からのジョブ投入は既存 Worker Lambda（Celery コンシューマ）が処理可能な形式であること。

### 7.3 OpenAI API
- IR-O1: Embedding（`text-embedding-3-small`, 1536 次元）・Chat をそのまま利用（HTTPS）。API キーは Wrangler Secret。
- IR-O2: Token 使用量を記録する。

### 7.4 メール送信
- IR-M1: メール確認・パスワードリセット・メール変更の送信基盤（現行 django-anymail 相当）を、Workers から利用可能なメール送信手段へ置き換える（Cloudflare Email Sending / 外部 SMTP/API のいずれか, §16 で決定）。

### 7.5 YouTube 取込
- IR-Y1: SearchAPI キーを用いた YouTube メタデータ取得を Workers から実行する。

---

## 8. 認証・認可要件（主要4経路）

現行の認証経路は **(1) Cookie JWT / (2) API キー / (3) OAuth2 Bearer（MCP 等）/ (4) Share 認証（クエリ）** の4系統。ルート別に適用される認証が異なるため、移行時は**ルート×認証マトリクス**を作成して契約化する。

> **PoC #03 実測（2026-08-01）**: Cookie/Bearer JWT（HS256+`SECRET_KEY`）と API キー（SHA-256）の**暗号パリティを実測合格** — Worker(`jose`/`crypto.subtle`)が Django 発行物を同一検証し、改ざんは拒否。OAuth/Share は既存テーブル（`oauth2_provider_accesstoken.token_checksum` / `app_videogroup.share_slug`）の DB 照合で、Worker からの読み取りは PoC #01 で実証済み。→ **HS256 共有で無停止カットオーバー可能**（[PoC #03](./poc-03-auth-cutover.md)）。

### 8.1 Cookie JWT（ブラウザ）
- AU-1（現行互換・**PoC #03 で実測合格**）: HttpOnly Cookie（または Bearer ヘッダ）の JWT を Workers（`jose`）で検証。検証項目: 署名 / 有効期限 / token type。**現行は issuer/audience の明示設定・ブラックリスト失効を持たない**（`token_blacklist` 未導入, `BLACKLIST_AFTER_ROTATION=False`, 失効は no-op）。user 識別は `sub` ではなく SimpleJWT の user_id claim。**まず現行と等価に検証**すること。
- AU-1b（新規改善・任意）: ブラックリスト失効・issuer/audience 検証は**現行に存在しない新機能**であり、互換要件とは分離してオプトインで導入する。
- AU-2: 署名鍵は現行 SimpleJWT 設定（既定 HS256 / `SECRET_KEY`）と整合。ただし HS256→RS256/EdDSA は**「トークン形式を変えずに」実施できない**（署名アルゴリズム変更）。切替時は**旧 HS トークンを有効期限まで二重検証する移行期間**を設けるか、全セッション失効を受容する（§16 決定事項）。
- AU-3: CSRF: 非安全メソッドかつ Cookie 認証時のみダブルサブミット方式の CSRF 検証を再実装（`authentication.py:112` の条件を踏襲）。特に OAuth `/authorize` の同意 POST に適用する。

### 8.2 API キー
- AU-4: `UserApiKey` のハッシュ照合（Web Crypto `crypto.subtle` SHA-256）と `AccessLevel` によるスコープ制御を実装する。OpenAI 互換 API（`/api/v1/`）とチャット系の API クライアント認証に用いる。
- AU-4b: **認証成功ごとに `last_used_at` を DB 更新する**（`api_key_resolver.py:9`）。読み取り API でも書き込みが発生するため、Hyperdrive キャッシュ挙動・負荷・更新失敗時のフォールバックを設計に含める（更新は非同期化/ベストエフォート可）。

### 8.3 Share 認証（クエリ）
- AU-5: `share_slug`（旧 `share_token`）をクエリパラメータで受け、共有グループへの匿名アクセスを許可する（`permissions.py:14`）。**slug はユーザー指定可能な最大64文字で、期限・ランダム性の保証がない**。クエリ露出（ログ/履歴/Referer）対策として、**Share 専用レート制限とログのトークンマスキング**を受け入れ条件とする。

### 8.4 OAuth2 認可サーバ / MCP
- AU-6: OAuth2 authorize（同意画面）/ token / introspect / トークン一覧・失効を提供する。同意画面はアンチフィッシングのため redirect_uri ホストを表示（既存 `authorize.html` 相当を Workers 側 HTML で再構築）。
- AU-7: **MCP エンドポイントは OAuth2 / Bearer API キー / X-API-Key の3方式を受理**（`mcp/views.py:45`）。OAuth 限定ではない点を維持する。
- AU-8: 既存 OAuth クライアント（claude.ai / Claude Desktop）との**ライブ統合テスト**（DCR → 同意 → token → Bearer challenge）を受け入れ基準とする。**既存の DCR client / access / refresh / grant の移行または再認可方針**を確定する（ライブ新規認可試験だけでは不足）。
- AU-9: パスワードハッシュ（Django PBKDF2）は Workers `crypto.subtle`（10万回上限）でネイティブ検証できないため、**WASM/純JS 検証 + ログイン時遅延リハッシュ、または強制リセット**のいずれかを採用する（§16 決定事項）。
- AU-10: メール確認・パスワードリセットのトークンは Django `default_token_generator`（password/last_login/email/`SECRET_KEY` 由来, `common/email.py:19`）。**メール配送サービスだけ置換しても、カットオーバー前に発行済みのリンクは検証できない**。`SECRET_KEY` 共有での検証移植 or 失効方針を決める。

### 8.5 共通
- AU-11: 全動画操作で所有権・グループアクセス権を確認する。pgvector 検索の前段でアクセス権を検証する（DR-3）。
- AU-12: CORS は Pages 本番ドメインに限定し、credentials（Cookie）を許可する。

---

## 9. 非同期ジョブ連携要件（最重要）

現行は **Celery over SQS**（ブローカー `sqs://`, キュー `videoq-worker`, `predefined_queues`）。既存タスク名（`backend/app/contracts/tasks.py` / `entrypoints/tasks/`）:

`TRANSCRIBE_VIDEO_TASK` / `INDEX_VIDEO_TRANSCRIPT_TASK` / `REINDEX_VIDEO_TRANSCRIPT_TASK` / `REINDEX_ALL_VIDEOS_EMBEDDINGS_TASK` / `BUILD_PLOG_TASK` / `EVALUATE_CHAT_LOG_TASK` / `DELETE_ACCOUNT_DATA_TASK`。

Celery のメッセージは独自プロトコル（本文 base64、`task`/`id`/`args`/`kwargs` ヘッダ等）でエンコードされるため、**計画書の「raw JSON を SendMessage」では既存 Worker は起動しない**。以下いずれかを採用する。

消費側 Lambda（`lambda_handler.py`）は通常の Celery worker ではなく、**Celery エンベロープを部分解釈して `task.apply()` で同期実行する独自アダプタ**である。SQS body が直接 JSON ならそのまま読み、失敗時のみ外側 base64 を復号する（`lambda_handler.py:77`）。実際に使うのは `headers.task` / `headers.id` / base64 内側 body のみで、`properties`/`eta`/`retries` 等は無視される。この事実が投入方式の選択を左右する。

- **方式A: 初期はジョブ投入を既存 Django ルート経由に残す。** ストラングラー期間中は Web ルートを Django にプロキシするため、投入も既存経路が使える。**専用ディスパッチ薄 API の新設は不要**（内部認証・AWS↔CF 遅延・二重投入を増やすだけ）。
- **方式B: Workers が Celery v2 互換メッセージを直接生成して SQS 送信。** Lambda が読むのは `headers.task/id` と base64 内側 body のみのため、Workers 側での再現は**難易度が低い**（UUID 生成・JSON 化・UTF-8/base64・SigV4 `SendMessage`）。ただし現物メッセージを golden fixture 化し、`celery`/`langchain-postgres` の**バージョンを下限指定でなく固定**する必要がある。
- **方式C（最終形として推奨）: Lambda アダプタに plain-JSON 分岐を追加。** 消費側が既に独自アダプタなので、`{version, task, job_id, args}` の JSON 分岐を1つ足せば、Workers を Celery/Kombu 形式から完全に切り離せる。移行中は Celery 形式と JSON 形式を両受けでき、改修量も小さい。

**推奨（PoC #02 実測で更新, 2026-08-01）**: **方式 B を初日から直接採用（ゼロ Lambda 改修で成立を実証）→ 冪等性対応と同時に方式 C へ整形**。方式 A（Django ディスパッチ残置）は必須ではなく、ストラングラー期間に Django ルートが残る間の暫定策として任意。
- 実測: 本物の `lambda_handler` が Worker の最小 JSON（`headers.task/id` + `base64(json([args,kwargs,embed]))`）を受理し同一タスクをディスパッチ。Worker→SQS(aws4fetch SigV4 on workerd)→ElasticMQ→consumer の全経路も PASS（[PoC #02](./poc-02-sqs-dispatch.md)）。
- 実 AWS SQS 疎通も実測合格（一時キューで Worker→実 SQS SendMessage 200 + MessageId、受信 body を lambda_handler が受理）。→ **投入経路は残課題なし**。冪等性(JR-2/JR-4)のみ新規設計（下記）。

要件:
- JR-1: 採用方式に関わらず、既存 Worker Lambda が現行どおり処理を開始できること。7タスク全てで Workers→SQS→Lambda の E2E を実施。
- JR-2（**新規機能・設計済 → [JR-2/JR-4 設計書](./jr2-idempotency-design.md)**）: `job_id` 冪等性は**現行に存在しない**。二重配信の実害あり（index の `add_texts` 重複 / reindex の空窓 / delete_account の孤児 vector）。設計は **fencing 付き claim 台帳（run_token/lease/payload_sha256）＋副作用の原子性境界別対応**。重要な制約: **PGVectorStore（別 PGEngine）は Django tx に包めない**ため vector は生 SQL delete+bulk insert か generation swap、外部副作用は outbox。台帳 completed は同一 DB 副作用と同一 tx。**Celery `retry()` は本 consumer 経路で使わず SQS redrive に一本化**（codex レビューで v1 の穴を是正, [レビュー記録](./jr2-idempotency-design-review-codex.md)）。
- JR-3: メッセージにバージョンを付与すること（方式B/C）。
- JR-4（**新規機能**）: 統一的な失敗ステータス・DLQ 連動は**現行に未整備**（全件 reindex は個別失敗を記録しても `completed` 返し, アカウント削除は例外握り潰し）。DLQ 維持＋失敗時ステータス更新＋理由 DB 保存を**新規要件**として設計する。
- JR-5: Workers の SQS IAM 権限は `SendMessage` のみに限定すること。

> 決定事項（§16）: 方式 A / B / C の選択。**推奨は初期 A → 最終 C**。

---

## 10. RAG / LangChain.js 移行方針

### 10.1 Workers へ移行する処理（検索側）
質問受付 → 質問 Embedding 生成 → pgvector 検索 → 関連チャンク取得 → プロンプト生成 → LLM 回答生成 → 引用・タイムスタンプ整形。

### 10.2 Lambda に残す処理（生成・保存側）
動画処理 → 文字起こし → チャンク生成 → Embedding 生成 → **Python PGVectorStore で保存**。
- 日本語形態素解析（janome）・キーワード分析（nltk）は JS 等価が非自明のため、**(a) Lambda 側 API として残す / (b) kuromoji.js 等で TS 再実装**のいずれかを選ぶ（§16 決定事項）。
- シーン分割（Otsu 法, `scene_otsu`）は計算量が重く（O(T²×1536)）、Workers CPU 上限に触れうる。移設可否は PoC で確認し、不可なら Lambda 残置とする。

### 10.3 役割分担（初期）
- 保存: Python Worker Lambda（langchain-postgres PGVectorStore）
- 検索: Cloudflare Workers（LangChain.js PGVector）
- Workers 側は初期段階でベクトル書き込みを行わない（DR-1）。

---

## 11. アプリケーション設計要件（Hono）

### 11.1 レイヤー構成
Route → Middleware → Service → Repository → Integration（R2 / SQS / OpenAI / LangChain.js）。Schema は Zod で入出力検証。LangChain.js 依存は Service 内に限定し、必要時に直接 SQL へ切替可能にする。

### 11.2 ディレクトリ構成（計画書の構成を踏襲）
`src/{index.ts, app.ts, routes/, middleware/, services/, repositories/, integrations/, db/, schemas/, types/, utils/}`。routes は現行ドメインに合わせ `auth / users / groups / videos / plog / chat / evaluation / oauth / mcp / openai(v1) / health` を用意する。

### 11.3 Bindings（型は一元管理）
```ts
export type Bindings = {
  HYPERDRIVE: Hyperdrive;
  VIDEO_BUCKET: R2Bucket;
  OPENAI_API_KEY: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  SQS_QUEUE_URL: string;
  JWT_SECRET_OR_PUBLIC_KEY: string;   // AU-2 の方式に応じて秘密鍵/公開鍵
  SEARCHAPI_KEY: string;
  LEGACY_API_ORIGIN: string;          // 未移行ルートのプロキシ先（§12）
  ENVIRONMENT: "development" | "staging" | "production";
};
export type Variables = { userId: string; requestId: string };
```
Secret（`wrangler secret`）: OpenAI / AWS / JWT 鍵 / SearchAPI。DB 接続文字列は Hyperdrive 設定内で管理する。

### 11.4 Neon 接続
- node-postgres（`pg`, `nodejs_compat`）→ Hyperdrive → Neon。
- **接続クライアントはリクエストごとに生成し、リクエスト間で使い回さない**（Cloudflare 公式が明示。global 共有 Pool は stale connection / I/O context エラーの原因）。共通化するのは**接続ファクトリと Repository 設定まで**とし、Client 自体はリクエストスコープにする。（初版の「再生成しない」は誤り）
- 標準 LangChain.js PGVector は `Pool` を要求するため、Hyperdrive 上での挙動を PoC で確認する（DR-4 の直接 SQL 第一候補とも関連）。
- Hyperdrive 専用 DB ユーザー（最小権限, テーブル単位に制限）を作成する。

---

## 12. 段階移行方式（ストラングラーフィグ）

Workers を API の統一入口とし、未移行ルートは既存 CloudFront/API Gateway/Django へプロキシ、移行済みルートは Workers で処理する。フロントの API 接続先は早期に Workers へ統一し、その後ルート単位で切替える。

```
Cloudflare Pages ─▶ Hono on Workers
                     ├─ 移行済みルート → Workers 処理
                     └─ 未移行ルート  → LEGACY_API_ORIGIN（CloudFront→APIGW→Django）
```

移行順序の原則: **参照系 → 検索(RAG) → 書き込み系 → 認証/OAuth → 廃止**。認証系（特に Cookie/CSRF/OAuth）と非同期投入方式は依存関係が深いため、プロキシ期間中は Django 実体を温存する。

---

## 13. 実装フェーズと受け入れ基準

各フェーズは「Django 版との契約テスト合格」と「該当非機能指標の記録」を完了条件に含む。

| Phase | 内容 | 主な完了条件 |
|---|---|---|
| 0 現状調査 | API 一覧・DB スキーマ・PGVector 設定・Celery メッセージ形式・認証仕様・R2 キー規則の確定 | 全 API が移行/維持/廃止に分類。**Celery メッセージ実サンプルの取得**（§9 方式決定の前提） |
| 1 Hono 基盤 | Workers/Hono/TS/Wrangler/CI、エラーハンドラ・CORS・Logger・RequestID・Zod・共通レスポンス・`/health` | dev デプロイ・`/health` 応答・自動テスト・環境別 Secret |
| 2 Hyperdrive/Neon | Hyperdrive・専用ユーザー・`pg` 接続・Repository 基盤・トランザクション・`/ready` | Neon 接続・クエリ実行・同時接続試験で枯渇なし・`/ready` 疎通 |
| 3 既存 API プロキシ | 未移行ルートを `LEGACY_API_ORIGIN` へ透過（Cookie/CSRF/Query/Body/ヘッダ転送） | フロントの API URL を Workers へ切替、未移行 API がレスポンス差分なく動作 |
| 4 参照系移行 | auth/me, groups, videos(一覧/詳細/status), chat/history, tags 参照 | 契約テスト合格・認可漏れなし・P95 記録 |
| 5 LangChain.js 検索移行 | 既存 pgvector への LangChain.js 接続・質問 Embedding・類似検索・メタフィルタ | **Python 版と上位10件チャンクが同等**・別動画混入なし・モデル/次元一致・DR-4 実証 |
| 6 RAG/チャット移行 | RAG Service・プロンプト移植・LLM 呼出・引用/タイムスタンプ・履歴保存・**SSE(keep-alive)** | 回答同等・権限外動画へ質問不可・LLM 失敗時の適切なエラー |
| 7 R2 移行 | R2 Binding・取得/削除/メタ・署名 URL・直アップロード・大容量試験 | 直アップロード成功・本体を非展開・削除整合 |
| 8 ジョブ投入移行 | §9 採用方式の実装・IAM(SendMessage のみ)・ジョブ生成・冪等性・DLQ 試験 | Worker Lambda が正常起動・二重送信で重複なし・失敗時 DLQ |
| 9 書き込み系移行 | groups/videos/tags 作成更新削除・チャットフィードバック・トランザクション・R2/SQS/pgvector 整合・監査ログ | DB/R2/SQS 不整合なし・再試行可能・仕様一致 |
| 10 OAuth/MCP 移行 | OAuth 認可サーバ・同意画面・MCP エンドポイント（原子的カットオーバー） | claude.ai/Claude Desktop ライブ統合テスト合格 |
| 11 本番切替 | 本番ドメイン・段階トラフィック・監視 | エラー率/レイテンシ/接続数/滞留の基準内 |
| 12 旧環境廃止 | CloudFront/APIGW/Django Lambda/Web Adapter/Terraform/IAM/Secret の削除 | Workers のみで本番稼働・Worker Lambda 継続 |

### 13.1 単体テスト
Route / Middleware / Zod / Service / Repository / PGVector 設定 / SQS メッセージ生成 / R2 キー生成 / エラー変換 / 認可判定。

### 13.2 統合テスト
Workers↔Neon(Hyperdrive) / R2 / SQS↔Worker Lambda / LangChain.js↔pgvector / OpenAI / 認証基盤。

### 13.3 契約（互換）テスト
同一リクエストを Django API と Hono API に送り、HTTP Status / JSON 構造 / 値 / エラーコード / ページネーション / ソート順 / 認証・認可結果を比較。

### 13.4 ベクトル検索比較テスト
同一質問を Python 版と LangChain.js 版へ入力し、上位10件チャンク ID / 順位相関 / 距離 / 類似度 / メタデータ / タイムスタンプ / 検索時間を比較。

### 13.5 負荷試験
API 同時接続 / pgvector 検索 / Hyperdrive 接続数 / Neon CPU・接続数 / R2 アップロード / SQS 大量投入 / OpenAI 待機 / 長時間チャット。

---

## 14. 非機能要件

- NFR-P1: 通常 API の P95 を現行以下。pgvector 検索時間を現行と同等以下。
- NFR-P2: API リクエスト内で動画処理を実行しない。OpenAI 待機中の不要 CPU 処理を避ける。
- NFR-A1: 未移行 API は Django へプロキシ。Workers 障害時の切り戻し経路を維持。
- NFR-A2: SQS/DLQ を利用し、Worker Lambda 処理は冪等。
- NFR-M1: Route/Service/Repository 分離、Binding 型一元管理、Zod スキーマ定義、LangChain.js 依存を Service 内に限定、SQS メッセージにバージョン付与。

---

## 15. セキュリティ要件

- SEC-1: Secret をコードへ埋め込まない（Wrangler Secret / Hyperdrive）。
- SEC-2: SQS IAM は `SendMessage` のみ。
- SEC-3: Hyperdrive 専用 DB ユーザー・テーブル単位権限。
- SEC-4: R2 オブジェクトキーをユーザー入力から直接生成しない。
- SEC-5: 全動画操作で所有権確認、pgvector 検索前にアクセス権確認。
- SEC-6: JWT の Issuer/Audience/有効期限/失効を検証。CSRF を非安全メソッドに適用。
- SEC-7: CORS を Pages 本番ドメインへ限定。
- SEC-8: エラーレスポンスに内部情報を含めない。SQL はパラメータ化。
- SEC-9: OpenAI へ送る情報を必要最小限に。ログにトークン・個人情報を出力しない。

### 15.1 削除処理手順（FR-V1 詳細）
1. アクセス権確認 → 2. 削除中ステータス更新 → 3. R2 削除 → 4. pgvector データ削除 → 5. 関連チャット履歴削除 → 6. レコード削除/論理削除 → 7. 監査ログ保存。各段は冪等・部分失敗補償を持つ。

---

## 16. 決定事項（推奨による暫定確定 + 要オーナー判断）

技術的確度が高いものは以下の推奨値で**暫定確定**とし（本書はこれを前提に記述）、事業・運用判断を要するものを「要判断」として残す。暫定確定はオーナー承認をもって正式確定とする。

### 16.1 暫定確定（推奨値を採用）

| # | 論点 | 決定（推奨） | 根拠 |
|---|---|---|---|
| 1 | ジョブ投入方式（§9） | **初期=方式A（既存 Django ルート経由, 専用 API 新設せず）→ 最終=方式C（Lambda に plain-JSON 分岐追加）**。Lambda 変更不可なら方式B | 消費側 Lambda が既に独自アダプタのため、JSON 分岐追加で Workers を Celery 形式から完全に切り離せる（codex レビューで最終B→Cへ是正） |
| 2 | JWT 署名方式（AU-2） | **カットオーバー前に RS256/EdDSA へ切替**（Workers は公開鍵のみ保持） | HS256 共有秘密をエッジに置くと Worker 侵害＝トークン偽造。片道ドアなので早期に決める |
| 3 | パスワードハッシュ互換（AU-7） | **WASM PBKDF2 検証 + ログイン時遅延リハッシュ**（強制リセットは回避） | 既存ユーザーの再ログインを妨げず、段階的に新方式へ移行できる |
| 4 | シーン分割 Otsu 移設（§10.2） | **既定は Lambda 残置**。PoC で Workers CPU 上限内が実証できた場合のみ移設 | O(T²×1536) で 5分 CPU 上限リスク。保存側は元々 Lambda のため残置が自然 |
| 5 | 評価(ragas)・Plog 構築（§5.4/5.5） | **Lambda 残置で確定**。TS 化は本移行のスコープ外（将来課題） | ragas に JS 等価なし。純 TS 化は目標を崩すため非目標に一致 |
| 6 | LangChain.js ↔ pgvector 互換（DR-4） | **確定: 直接 SQL 本線**（PoC #01 実測で標準フィルタは 0 件と判明） | 本番規模は HNSW index 追加が前提。埋め込み次元は環境依存（1024/1536） |

### 16.2 要判断（オーナー決定が必要）

| # | 論点 | 選択肢 | 補足 |
|---|---|---|---|
| 7 | 日本語 NLP（§10.2, 分析/キーワード） | (a) Lambda 残置 / (b) kuromoji.js 等で TS 再実装 | 分析機能の重要度と将来の純 TS 化方針次第。低リスクは (a) |
| 8 | メール送信基盤（§7.4） | (a) Cloudflare Email Sending / (b) 外部 SMTP・API（現行 anymail 相当を継続） | 到達率・DKIM/SPF/DMARC 運用と既存プロバイダ契約に依存 |
| 9 | Django Admin（§3.1） | (a) 廃止 / (b) 別ツール / (c) Django 最小残置 | **任意機能ではなく現行運用機能**：Admin で quota 上限・使用量設定、全ベクトル再 index 起動を行う（`admin.py:40,104`）。**新規ユーザーの quota 既定は 0** のため、廃止するなら少なくとも **quota 設定・使用量修正・reindex 起動・ジョブ/DLQ 状態確認の代替**が必須 |

---

## 17. リスクと対策

| リスク | 対策 |
|---|---|
| **Celery 非互換で Worker が起動しない**（最重要） | §9 方式A で開始、最終は方式C（Lambda に JSON 分岐追加）。現物メッセージを golden fixture 化、celery/langchain-postgres をバージョン固定 |
| **重複配信でベクトル重複/消失**（新規リスク） | JR-2 で job_id 冪等性と処理済み台帳を新規設計。index は delete-then-insert を冪等化 |
| **LangChain.js 標準フィルタが現行スキーマと非互換** | DR-4：user_id/video_id は独立列。**直接 SQL を第一候補**にし、標準 PGVector は PoC 検証のみ |
| **quota を単純 CRUD 移植して無料利用/二重課金** | FR-Q：条件付き UPDATE 予約・遅延月次リセット・記録失敗挙動を保持。予約解放 reconciliation を追加 |
| **Django Admin 廃止で quota 設定不能**（新規0既定） | 廃止前に quota 設定・reindex・ジョブ確認の代替 UI/API を用意（§16.2 #9） |
| **発行済み JWT/メールリンクがカットオーバーで失効** | HS→RS 二重検証期間、SECRET_KEY 共有でのメールトークン検証移植 or 失効方針（AU-2/AU-10） |
| Python と LangChain.js で検索結果が異なる | 同一モデル/次元/距離で比較テスト（§13.4）。不成立なら直接 SQL 検索へ |
| Cookie/CSRF 認証移行でセッションが切れる | プロキシ期間は Django 実体温存、認証系は後段フェーズで慎重に切替 |
| OAuth/MCP の既存クライアント非互換 | ライブ統合テストをフェーズ10の完了条件に |
| PBKDF2 ネイティブ非対応 | WASM 検証 + 遅延リハッシュ / 強制リセット |
| SQS 二重投入 | `job_id` 冪等性・Worker 側処理済み確認 |
| R2 と DB の不整合 | ステータス管理と補償処理、アウトボックス/冪等パターン |
| Workers 制限超過（CPU/メモリ） | 重量処理を Lambda 残置、Otsu 分割は PoC 判定 |
| 移行範囲が大きい | 参照→検索→書込→認証の順で段階移行、プロキシで常時ロールバック可能 |

---

## 18. 完了条件

- フロントが Workers API のみを参照している。
- 主要 API が Hono 上で動作し、3系統の認証・認可が正常機能。
- Workers から Hyperdrive 経由で Neon に接続、LangChain.js で既存 pgvector を検索でき、Python 版と検索品質が許容範囲内。
- RAG/チャット/OpenAI 互換/MCP/OAuth が Workers 上で動作。
- R2 の直アップロード/取得/削除が正常。Workers から SQS へジョブ投入でき、Worker Lambda が従来どおり動画処理・pgvector 保存を実行。
- API 用 CloudFront/API Gateway/Django API Lambda を停止済み。監視・ログ・アラート・切り戻し手順を文書化済み。

---

## 付録A: 可観測性

- Workers: request_id / user_id / route / method / status / duration / DB・vector・OpenAI・SQS 各処理時間 / error code / environment。
- Worker Lambda: job_id / video_id / SQS message id / FFmpeg・文字起こし時間 / チャンク数 / Embedding 件数 / pgvector 保存件数 / 再試行回数 / エラー理由。
- 監視対象: Workers エラー率・CPU 時間・P95、Hyperdrive/Neon 接続数・クエリ時間、SQS 滞留・DLQ、Lambda 失敗、R2 エラー、OpenAI エラー・料金。
