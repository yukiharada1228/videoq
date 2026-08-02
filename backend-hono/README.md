# backend-hono

VideoQ の Web バックエンドを Cloudflare Workers（Hono / TypeScript）へ段階移行するプロジェクト。
公式 `npm create hono@latest`（`cloudflare-workers` テンプレート）で生成し、移行要件に合わせて構造化。

- 設計: [docs/architecture/cloudflare-hono-migration-requirements.md](../docs/architecture/cloudflare-hono-migration-requirements.md)
- 実証 PoC: [docs/architecture/poc-01〜04](../docs/architecture/)

## 現状

**Django → Hono の Web API 移行は完了**。続けて **スコープ C（Drizzle + Django 依存切断）を実施済み**:
スキーマ正本は Drizzle（`src/db/schema`）、repositories は `withDb`、非同期ジョブは [`worker-python/`](../worker-python/)（Django/Celery なし）。旧 Django ツリーは [`archive/django-backend/`](../archive/django-backend/)。

- Django Web プロセス依存は撤去済み（catch-all プロキシなし。未定義パスは `{ detail: "Not found." }` の 404）
- Hono ルーター + 共通ミドルウェア（requestId / 構造化ログ / CORS / エラーハンドラ）
- `GET /health`・`GET /api/health/`（liveness）/ `GET /ready`（Hyperdrive 経由で Neon 疎通）
- Hyperdrive 経由の Neon 接続（**Client はリクエストごとに生成** — 要件 §11.4 / PoC #01d）
- R2 / ローカル `VIDEO_BUCKET`、運用 API（`/api/ops/`）、OpenAPI（`/api/schema|docs|redoc`）
- OAuth DCR は GET/POST/**PUT/DELETE**（RFC 7592）まで実装済み
- **重量ジョブ consumer（transcription / build_plog / ragas / reindex）は AWS Lambda 残置**（SQS 投入は Worker。要件 §3.3）

### 移行済みルート
| ルート | 認証 | 備考 |
|---|---|---|
| `GET /api/auth/csrf` | **認証不要（AllowAny）** | Django `CsrfTokenView`（GET）と契約互換。`csrftoken` cookie（32 文字 secret・`SameSite=None;Secure`(prod)/`Lax`(dev)・`HttpOnly=False`・Max-Age 1年）を設定し、body で 64 文字 masked token を返す（`{"csrftoken": ...}`）。既存 cookie の secret を再利用。`Vary: Cookie`+`Cache-Control: no-store`（get_token 準拠）。**発行した token は実 Django の `_does_token_match`/`_unmask_cipher_token` が受理**（双方向 interop 実証済み） |
| **`POST /api/auth/sessions`** | **認証不要（login bootstrap）** | Django `SessionView.post`（login）。**`Content-Type: application/json` 必須**（text/plain 経由の login-CSRF を塞ぐ、非 JSON は 415）。**throttle** `login_ip`/`login_username`（各 **5/minute**）。`LoginSerializer`(username/password) → `authenticateUser`（**pbkdf2_sha256 検証**・is_active・存在しない user もダミーハッシュでタイミング均等化・user_id は安全整数のみ fail-closed）→ 失敗は 400 `AUTHENTICATION_FAILED` `Authentication failed`。成功は **SimpleJWT 発行**（HS256, `{token_type,exp,iat,jti,user_id}`, access 10分/refresh 14日）→ **HttpOnly cookie**（access_token/refresh_token, `SameSite=None;Secure`(prod)/`Lax`(dev)）設定、body は `{}` |
| **`DELETE /api/auth/sessions`** | **認証不要** | Django `SessionView.delete`（logout）。refresh 無効化は現行同様 no-op、access_token/refresh_token cookie を削除、204 |
| **`DELETE /api/auth/account`** | **Cookie/Bearer JWT のみ** | Django `AccountDeleteView`（`AuthenticatedAPIView`）。`AccountDeleteSerializer`(reason 任意)。**tx**（`AccountDeletionRequest` 記録 → ユーザーを匿名化+非アクティブ化: `is_active=false`/`deactivated_at`/`username`=`email`=`deleted__<uuid4hex>`）→ **SQS へ `DELETE_ACCOUNT_DATA_TASK` 投入** → access/refresh cookie 削除、204 |
| **`POST /api/auth/tokens`** | **認証不要（refresh cookie）** | Django `RefreshView.post`（token refresh）。`refresh_token` cookie を検証（HS256・exp・`token_type=refresh`・user_id 安全整数）→ **rotation で新 access/refresh 発行**（`ROTATE_REFRESH_TOKENS=True`/`BLACKLIST_AFTER_ROTATION=False` = 旧トークンは失効させない）→ HttpOnly cookie 更新、body `{}`。cookie 欠落/無効/期限切れ/access 種別は 401 `AUTHENTICATION_FAILED` `Invalid refresh token`。**Django refresh を自 verify が受理／自 refresh を Django `RefreshToken()` が受理**（双方向 interop） |
| **`POST /api/auth/users`** | **認証不要（signup）** | Django `UserSignupView`。`Content-Type: application/json` 必須。**throttle** `signup_ip`/`signup_email`（各 **3/hour**）。`UserSignupSerializer`（username max150 / **EmailField**（Django EmailValidator 移植）/ **password 4-validator**（MinLength/Common(19640 語)/Numeric・UserAttrSim は user 無しで no-op））。`normalized_email=strip+lower`。**enumeration 対策: email 既登録でも成功と同一 201** `{"message":"Verification email sent. Please check your email."}`（user 作成せず）。新規は `create_inactive_user`（**make_password** で pbkdf2 生成・is_active=false・モデル既定 quota）→ **検証リンク**（`makeDjangoToken` + `uid=base64url(pk)` + `FRONTEND_URL/verify-email`）→ **Cloudflare Email 送信**（`send_email` binding）。送信失敗は 500 `INTERNAL_ERROR`。※実配信は送信元ドメインの onboarding が前提 |
| **`PATCH /api/auth/email-verifications/:uidb64/:token`** | **認証不要（AllowAny）** | Django `EmailVerificationView.patch`。`uid` を base64url 復号 → **`default_token_generator.check_token` 相当**（`checkDjangoToken`: HMAC 再計算の定数時間比較 + 3 日の有効期限）→ `is_active=true`。uid 不正/ユーザー不在/トークン不一致はすべて 400 `Invalid or expired verification link.` |
| **`PATCH /api/auth/password-resets/:uidb64/:token`** | **認証不要（AllowAny）** | Django `PasswordResetConfirmView.patch`。**順序も Django と一致**: serializer（`new_password` min_length=8 → `validate_password` の 4-validator）→ uid/token 検証 → `set_password`。リンク不正は 400 `Invalid or expired reset link.`、成功は 200 `Password reset successfully. Please sign in with your new password.` |
| **`POST /api/auth/password-resets`** | **認証不要（AllowAny）** | Django `PasswordResetRequestView.post`。**throttle** `password_reset_ip`/`password_reset_email`（各 **3/hour**）。`email`(EmailField) → `email__iexact` + `is_active` で検索（`upper(email::text)`、`ORDER BY id LIMIT 1`）→ **再設定メール送信**（`{FRONTEND_URL}/reset-password?uid=..&token=..`）。**未登録でも同一の 200**（列挙防止）`Password reset email sent. Please check your email.`。正規化は **strip のみ**（signup と違い lower しない） |
| **`PATCH /api/auth/me/email`** | **Cookie/Bearer JWT のみ** | Django `EmailChangeRequestView.patch`。**throttle** `email_change_user`/`email_change_email`（各 **3/hour**）。`email`(EmailField) を strip+lower → **既に誰かが使用中ならサイレント成功**（`pending_email` も設定しない）。空きなら `pending_email` を保存し、**新アドレス宛**に確認メール（`{FRONTEND_URL}/change-email?uid=..&token=..`）。送信失敗でも `pending_email` は戻さず 500 `INTERNAL_ERROR`（現行同様）。200 `Email change confirmation sent. Please check your new email address.` |
| **`PATCH /api/auth/email-change/:uidb64/:token`** | **認証不要（AllowAny）** | Django `EmailChangeConfirmView.patch`。**`EmailChangeTokenGenerator` 互換**（hash value 末尾に `pending_email` を連結する派生。key_salt は親クラス継承で同一 → **pending_email が変わると失効**、default 派生との取り違えも不可）。`pending_email` 無し/トークン不一致/他ユーザーが同アドレス取得済みは 400 `Invalid or expired email change link.`。確定は 1 トランザクション（衝突 SELECT → `email=pending_email, pending_email=NULL`、一意制約 23505 も false に倒す）、200 `Email address updated.` |
| **`GET/PUT/DELETE /api/auth/searchapi-key`** | **Cookie/Bearer JWT のみ** | Django `SearchApiKeyView`。GET は `{"has_api_key": bool}`（NULL 判定のみで復号不要）。PUT は `SearchApiKeySerializer`(api_key・trim) → **Fernet 暗号化**して `bytea` に保存（`convert_to($1,'UTF8')`）、200 `SearchAPI API key saved.`。DELETE は NULL 化、200 `SearchAPI API key deleted.`。更新 0 行（ユーザー不在）は 404 `User not found` |
| `GET /api/auth/me` | **API キー + Cookie/Bearer JWT** | Django `MeView` と完全契約互換。`UserSerializer` と同形の**生 JSON**（統一封筒は使わない） |
| `GET /api/auth/api-keys` | **Cookie/Bearer JWT のみ** | `ApiKeyListCreateView.get`（`AuthenticatedAPIView`=CookieJWT のみ、**API キーでは管理不可**）。アクティブキー一覧（`ApiKeySerializer`: id/name/access_level/prefix/last_used_at(nullable)/created_at, `-created_at,-id` 順, Chicago tz）。生キーは返さない |
| **`POST /api/auth/api-keys`** | **Cookie/Bearer JWT のみ** | `ApiKeyListCreateView.post`。`ApiKeyCreateSerializer`(name max100/access_level ChoiceField default `all`)。同名アクティブキーは 400 `An active API key with this name already exists: <name>`（`{name:[...]}`）。**raw key = `vq_`+token_urlsafe(32)（sha256 で保存, prefix=先頭12）**、201 で `ApiKeySerializer` + `api_key`(生キー・1 回のみ) |
| **`DELETE /api/auth/api-keys/:id`** | **Cookie/Bearer JWT のみ** | `ApiKeyDetailView.delete`（revoke）。アクティブなキーの `revoked_at=now()`、204。不在/失効済みは 404 `API key not found` |
| `GET /api/videos/groups/` | API キー + Cookie/Bearer JWT | `VideoGroupListView` と完全契約互換。**実 DRF シリアライザとバイト一致**（§13.3）。limit/offset ページネーション、datetime は America/Chicago オフセット + マイクロ秒 |
| `GET /api/videos/groups/:id/` | API キー + Cookie/Bearer JWT | `VideoGroupDetailView` と完全契約互換（**実 DRF とバイト一致**）。`updated_at`/`share_slug` + **ネスト `videos`**（各動画は VideoList 相当 + `order`、`file` は presigned、メンバー順 `order,added_at`）。未所有/不在は 404 `Group not found`（ピリオド無し）。id 数値のみで一覧とは競合せず |
| `GET /api/videos/groups/share/:slug/` | **認証不要（AllowAny）** | `get_shared_group` と契約互換。`share_slug` 完全一致（大文字小文字区別）で `VideoGroupDetailSerializer`（`getGroupDetail` と同形・`fetchGroupDetail` を共有）。不在は 404 `Share link not found`。"share" は非数値なので `:id{[0-9]+}` 詳細と非競合。※ `ShareTokenIPThrottle`（IP レート制限）は edge/CF 側に委譲予定 |
| `GET /api/videos/` | API キー + Cookie/Bearer JWT | `VideoListView` と完全契約互換。**実 DRF シリアライザとバイト一致**。q/status/ordering/tags フィルタ、`file` は **R2 presigned GET URL**（youtube 等は null）、`tags`（名前順）、`youtube_embed_url` |
| `GET /api/videos/:id/` | API キー + Cookie/Bearer JWT | `VideoDetailView` と完全契約互換（**実 DRF とバイト一致**）。一覧 + `user`/`transcript`/`error_message`。id は数値のみ（`:id{[0-9]+}`）。未所有/不在は `{"error":{"code":"VALIDATION_ERROR","message":"Video not found"}}` の 404 |
| `GET /api/chat/groups/:id/history/` | API キー + Cookie/Bearer JWT | `ChatGroupHistoryView` と完全契約互換（**実 DRF とバイト一致**）。limit/offset ページネーション、`citations`（1 始まり index の id）、`created_at` は America/Chicago。所有者のみ（未所有/不在は 404 `Group not found.`）。**`?download=csv`** は Python `csv.writer` + `json.dumps(ensure_ascii=False)` 互換（CRLF・QUOTE_MINIMAL・UTC `datetime.isoformat()`、SHA-256 固定ベクタで検証） |
| **`DELETE /api/chat/groups/:id/history/`** | API キー + Cookie/Bearer JWT | **履歴リセット**（`ResetChatHistoryUseCase`）。`requireAuth → csrfProtect → requireScope()`（非安全メソッド=write）。所有者のみ・未所有/不在は 404 `Group not found.`。tx で `chatlogevaluation` → `chatlog` の順に削除（DB に ON DELETE CASCADE が無いため明示）、**204** |
| `GET /api/chat/groups/:id/analytics/` | API キー + Cookie/Bearer JWT | `ChatGroupAnalyticsView` と完全契約互換（**実 DRF とバイト一致**）。`summary`(total_questions/date_range=**UTC isoformat**)、`time_series`(**Chicago 日付**の TruncDate)、`feedback`(good/bad/none=NULL 数)。**キーワード分析は削除済み**（janome/nltk・MCP tool・ダッシュボード UI 含む） |
| `GET /api/evaluation/groups/:id/summary/` | API キー + Cookie/Bearer JWT | `EvaluationSummaryView` と完全契約互換（**実 DRF とバイト一致**）。RAGAS 集計（status=completed 母集団の **SQL AVG**、full-precision float 一致）。未所有/不在は 404 `Group not found`（ピリオド無） |
| `GET /api/evaluation/groups/:id/logs/` | API キー + Cookie/Bearer JWT | `EvaluationLogsView` と完全契約互換（**実 DRF とバイト一致**）。per-ChatLog 評価（chat_log.created_at DESC、limit/offset、`evaluated_at` は Chicago tz nullable）。評価計算自体は Lambda(ragas) に残置 |
| `GET /api/videos/:id/plog/` | API キー + Cookie/Bearer JWT | `PlogGraphView` と完全契約互換（**実 DRF とバイト一致**）。build 状態 + `concepts`(intro_sec,id 順・JSON 学習オブジェクト・hint_count/waypoint_count) + `edges`(id 順・source/target label join)。build job 無しは `build_status:"missing"` の空グラフ。未所有/不在は 404 `Video not found.` |
| `GET /api/videos/:id/plog/learner-state/` | API キー + Cookie/Bearer JWT | `PlogLearnerStateView` と完全契約互換。`states`(user×video の LearnerConceptState + concept.label) |
| **`DELETE /api/videos/:id/plog/learner-state/`** | API キー + Cookie/Bearer JWT | **学習者状態リセット**（`ResetLearnerStateUseCase`）。`required_scope=read`（Django と同じく read_only キーも可）。200 `{deleted:N}` |
| **`POST /api/videos/:id/plog/rebuild/`** | API キー + Cookie/Bearer JWT | **PLOG 再ビルド投入**（`RebuildPlogUseCase`）。存在 404 `Video not found.`（ピリオド有=`str(ResourceNotFound)`）→ transcript 無しは 404 `Transcript not found.`。既存 build job が `pending`/`running` なら新規作成せず既存を返す、それ以外は job 作成（status=`pending`）。**SQS へ `BUILD_PLOG_TASK` 投入**。202 `{video_id, status, job_id}` |
| **`POST/PATCH/DELETE .../plog/concepts/`** | API キー + Cookie/Bearer JWT | **グラフ編集**（`EditPlogGraphUseCase`）。concept 作成(201・label embed・空 LO 作成) / 更新(label 変更時のみ再 embed) / 削除(learner→LO→edges→concept 明示削除) / **merge**(辺の付け替え・LO 配列の `_stable_key` 重複排除・learner 合流) / **learning-object** PATCH。`ensure_ready_build_job`（ready 以外で pending/running なら 400、無ければ ready ジョブ作成）。所有者のみ・一意制約は 400 |
| **`POST/PATCH/DELETE .../plog/edges/`** | API キー + Cookie/Bearer JWT | **辺編集**。ordering 辺（`prerequisite_of`/`builds_on`）は **DAG 検証**（サイクル→400）。作成 201・更新は少なくとも 1 フィールド必須・削除 `{deleted:true,id}` |
| **`PATCH /api/chat/logs/:id/feedback/`** | API キー + Cookie/Bearer JWT + **Share(share_slug)** | **最初の書き込みルート**（`ChatLogFeedbackView`, 完全契約互換）。`feedbackAuth`（認証 OR share 解決）→ **`csrfProtect`**（Cookie 認証時）→ **`requireScope("chat_write")`**。feedback∈{good,bad,null} 検証(400)、log 不在(404)、権限=owner or share 一致(403)。workerd 統合で 8 シナリオ Django 一致を実測 |
| **`POST /api/chat/messages/`** | API キー + Cookie/Bearer JWT + **Share(share_slug)** | **RAG / PLOG study チャット**（`ChatView`）。`ChatRequestSerializer`（messages/group_id/mode/study_session_id）を DRF 忠実再現。順序: 前提条件 → group/owner → AI 回答上限 → **mode=qa**: ベクトル検索 + system プロンプト + gpt-4o-mini（max_tokens 1024・履歴非渡し）／**mode=study**: `PlogGuidedChatGateway` 相当（`src/lib/plog-study.ts`＋`plog-runtime.ts`。ready グラフ + ordering DAG 必須・GradeReply + Socratic nudge・学習者状態 H は KV `STUDY_SESSION` の `plog:study:ephemeral:` TTL 12h）→ ChatLog → RAGAS SQS（best-effort）→ 使用量記録。応答 `{role,content,citations?,chat_log_id?,feedback?}`。PLOG 未準備は **409 `PLOG_NOT_READY`**。LLM 設定エラー 400、プロバイダ障害 500 |
| **`POST /api/chat/messages/stream/`** | 同上 | **SSE ストリーミング**（`StreamChatView`）。ヘッダは `text/event-stream` + `Cache-Control: no-cache` + `X-Accel-Buffering: no`、フレームは `data: {json}\n\n`。`content_chunk` → `done`（`chat_log_id`/`feedback`/条件付き `citations`）。**mode=study は generate 後に全文 1 chunk**（Django `stream_reply` と同じ・トークンストリームではない）。エラーは HTTP 200 のまま `error` イベント（`PLOG_NOT_READY` 含む）。ストリーム開始前の 400 のみ HTTP エラー |
| **`POST /api/v1/chat/completions(/)`** | **Bearer API キー** + ApiKey + Cookie/Bearer JWT | **OpenAI 互換**（`OpenAIChatCompletionsView`）。Django はスラッシュ無しのみだが Worker は**両方可**。認証順は Django と同じ（`BearerAPIKeyAuthentication` → `APIKeyAuthentication` → `CookieJWTAuthentication`）。`vq_` 始まりの Bearer は API キー、それ以外は JWT。共有アクセス無し・`required_scope=chat_write`（read_only キーも可）。`OpenAIChatRequestSerializer`（model/messages/group_id/temperature/max_tokens/top_p/stream/language）を検証し、標準フィールドは受けて無視。RAG 本体は `POST /api/chat/messages` と同じ。成功は `{id,object,created,model,choices[{message:{role,content,citations?,chat_log_id?}}],usage}`。ドメイン例外は OpenAI 形式 `{"error":{message,type}}`（`invalid_request_error` / `permission_denied` / `insufficient_quota` / `api_error`）。検証エラーのみ DRF 統一封筒 |
| **`POST /api/videos/groups/`** | API キー + Cookie/Bearer JWT | **CRUD 書き込み**（`VideoGroupListView.post`）。書き込みガード `requireAuth → csrfProtect(Cookie 時) → requireScope("write")`。`VideoGroupCreateSerializer`（name max255・description default ""）を **DRF CharField 忠実再現**（`utils/drf-fields.ts`: int/float 強制変換・blank/null/max 判定順）。`display_order = MAX+1` を**単一 INSERT で原子採番**、`share_slug=NULL`、201 で詳細を返す。エラーは `{"error":{code,message,fields}}` |
| **`PATCH /api/videos/groups/:id/`** | API キー + Cookie/Bearer JWT | **CRUD 書き込み**（`VideoGroupDetailView.patch`）。partial update（提供フィールドのみ動的 SET・**`updated_at` 不変**=現行互換）、200 で詳細。未所有/不在は 404 `Group not found`（ピリオド無） |
| **`DELETE /api/videos/groups/:id/`** | API キー + Cookie/Bearer JWT | **CRUD 書き込み**（`VideoGroupDetailView.delete`）。**トランザクションで cascade 削除**（`FOR UPDATE` → chatlogevaluation → chatlog → member → group）、204。未所有/不在は 404 `Group not found` |
| `GET /api/videos/tags/` | API キー + Cookie/Bearer JWT | `TagListView.get` と契約互換。`Tag.Meta.ordering=["name"]` の **name 昇順**（DB collation en_US.utf8）、`video_count=Count("video_tags")`、limit/offset。実データで順序・件数・Chicago offset を確認 |
| `GET /api/videos/tags/:id/` | API キー + Cookie/Bearer JWT | `TagDetailView.get` と契約互換。TagList + ネスト `videos`（各 VideoList 相当・`file` は presigned）。未所有/不在は 404 `Tag not found`。videos 順は Django 既定（`["tag__name"]`=定数）に対し安定な挿入順 `vt.id ASC` を採用 |
| **`POST /api/videos/tags/`** | API キー + Cookie/Bearer JWT | **CRUD 書き込み**（`TagListView.post`）。`TagCreateSerializer`（name max50 **trim なし**・color required）→ **ドメイン 2 層**（`normalizeTagName` 空 → 400 `Tag name cannot be empty`、`isValidTagColor` パレット名のみ → 400 `Invalid color...`）。201 で TagList 相当（`video_count:0`）。name×user 一意違反は現行同様 500 |
| **`PATCH /api/videos/tags/:id/`** | API キー + Cookie/Bearer JWT | **CRUD 書き込み**（`TagDetailView.patch`）。`TagUpdateSerializer`（partial・双方 optional・name trim なし）。順序は **serializer(400 fields) → 存在(404) → ドメイン(400 message)**（Django UseCase と一致）。提供フィールドのみ動的 SET、200 で詳細 |
| **`PUT /api/videos/tags/:id/`** | API キー + Cookie/Bearer JWT | **CRUD 書き込み**（`TagDetailView.put`）。`TagFullUpdateSerializer`（**name/color 必須**）。以降は PATCH と同一パス（存在 404 → ドメイン 400 → 200 詳細） |
| **`DELETE /api/videos/tags/:id/`** | API キー + Cookie/Bearer JWT | **CRUD 書き込み**（`TagDetailView.delete`）。**トランザクション**（`FOR UPDATE` → videotag → tag）、204。未所有/不在は 404 `Tag not found` |
| **`POST /api/videos/:vid/tags/`** | API キー + Cookie/Bearer JWT | **関連付け書き込み**（`add_tags_to_video`）。空/未指定 → 400 `Tag IDs not specified`、動画未所有 → 404 `Video not found`、非所有タグ含む → 404 `Resource not found`。`plan_tag_attachment`（request dedupe + 既付与 skip）→ tx（動画 `FOR UPDATE` → 既存除外 → 一括 INSERT）。201 `{message,"added_count","skipped_count"}` |
| **`DELETE /api/videos/:vid/tags/:tid/`** | API キー + Cookie/Bearer JWT | **関連付け書き込み**（`remove_tag_from_video`）。順序 動画 404 → タグ 404 → 未付与は 404 `Resource not found`（`assert_has_tag`）。剥がして 200 `{message:"Tag removed from video"}` |
| **`POST /api/videos/groups/:gid/videos/`** | API キー + Cookie/Bearer JWT | **関連付け書き込み**（`add_videos_to_group` bulk）。空/未指定 → 400 `Video ID not specified`、group 404、非所有動画含む → 404 `Some videos not found`。`plan_bulk_add`（dedupe + 既メンバー skip）→ tx（group `FOR UPDATE` → 実在&未メンバーのみ → `order=MAX+ordinality` で bulk INSERT）。201 |
| **`POST /api/videos/groups/:gid/videos/:vid/`** | API キー + Cookie/Bearer JWT | **関連付け書き込み**（`AddVideoToGroupView.post`）。group 404 → video 404 → 既メンバーは 400 `This video is already added to the group`。tx（`FOR UPDATE` → 既存確認 → `order=MAX+1`）、201 `{message,"id"}` |
| **`DELETE /api/videos/groups/:gid/videos/:vid/`** | API キー + Cookie/Bearer JWT | **関連付け書き込み**（`AddVideoToGroupView.delete`）。group 404 → video 404 → 非メンバーは 404 `This video is not added to the group`。tx で member 削除、204 |
| **`PATCH /api/videos/groups/order/`** | API キー + Cookie/Bearer JWT | **並び替え書き込み**（`reorder_video_groups`）。`ReorderGroupsRequestSerializer`（`group_ids` = DRF `ListField(IntegerField)` を `validateIntIdList` で再現／child 不正は "Bad Request" 平坦化）。空/重複/非所有 → 400 `Specified group IDs do not match user groups`。tx（`FOR UPDATE`）で **既存 display_order 値集合を新順へ再割り当て**（値保存）。200 |
| **`PATCH /api/videos/groups/:gid/videos/order/`** | API キー + Cookie/Bearer JWT | **並び替え書き込み**（`reorder_videos_in_group`, serializer 未使用）。非配列 → 400 `video_ids must be an array`、group 404、メンバー集合と不一致（件数/集合/重複）→ 400 `Specified video IDs do not match videos in group`。tx で `order` を 0 始まり連番へ。200 |
| **`POST /api/videos/groups/:gid/share/`** | API キー + Cookie/Bearer JWT | **共有リンク書き込み**（`CreateShareLinkView.post`）。順序 serializer(400 fields) → group 404 → `ShareSlugPolicy.normalize`（strip+lower・3-64・`--`不可・パターン・予約語 → 400）→ **CI unique(`lower(share_slug)`) 衝突は 409 `CONFLICT`**（`This share link is already in use`）。201 `{message,"share_slug"}` |
| **`DELETE /api/videos/groups/:gid/share/`** | API キー + Cookie/Bearer JWT | **共有リンク書き込み**（`CreateShareLinkView.delete`）。group 404 → 未設定は 404 `Share link is not configured`。`share_slug=NULL` にして 204 |
| **`PATCH /api/videos/:id/`** | API キー + Cookie/Bearer JWT | **動画メタ更新 / アップロード確定**（`VideoDetailView.patch`, **完全自前化・proxy 委譲なし**）。`status:"uploaded"` → **アップロード確定**（`ConfirmVideoUploadUseCase`: 存在 404 → status≠uploading は 400 → UPLOADING→PENDING 条件付き遷移 → SQS transcription 投入 → 200）。それ以外は `VideoUpdateSerializer`(title/description/**transcript**, 存在 404→serializer 順)。**transcript は SRT 検証**（`Transcript must be in valid SRT format.`）、変更時 **SQS 再index 投入**（`REINDEX_VIDEO_TRANSCRIPT_TASK`）。title 変更時 PGVector メタ同期（best-effort）|
| **`PUT /api/videos/:id/`** | API キー + Cookie/Bearer JWT | **動画メタ全更新**（`VideoDetailView.put`）。`VideoFullUpdateSerializer`（**title 必須**・description default ""）。以降は PATCH と同一（title 変更→vector 同期→200 詳細）|
| **`POST /api/videos/youtube/`** | API キー + Cookie/Bearer JWT | **YouTube 動画登録**（`CreateYoutubeVideoUseCase`）。`YoutubeVideoCreateSerializer`（youtube_url=URLField→`extract_youtube_video_id`, title max255, description default ""）。不正 URL 形式 → `Enter a valid URL.`、非 YouTube/ID 抽出失敗 → `Invalid YouTube URL.`（11桁・`-_`許容・host allowlist）。`source_type=youtube`/`status=pending` で作成 + **SQS へ transcription 投入**。201 で詳細（`youtube_embed_url` 付き） |
| **`POST /api/videos/`** | API キー + Cookie/Bearer JWT | **`USE_S3_STORAGE=false`（ローカル既定）**: multipart `CreateVideoUseCase` 相当 → `VIDEO_BUCKET.put(media/...)` → status=`pending` → transcription 投入 → 201。**`USE_S3_STORAGE=true`（本番）**: 廃線。400 で `/uploads/` 経路を案内 |
| **`POST /api/videos/uploads/`** | API キー + Cookie/Bearer JWT | **`USE_S3_STORAGE=true` のみ**。署名 URL 要求（`RequestVideoUploadUseCase`）。local（false）は Django `LocalFileUploadGateway` 同様 400。serializer + allowlist + `FILE_TOO_LARGE` / `STORAGE_LIMIT_EXCEEDED`。保留動画 + presigned PUT。file key は `videos/{uid}/video_{ms}_{reservedBytes}{ext}`（**FR-Q3**）。201 `{video, upload_url}` |
| **`DELETE /api/videos/:id/`** | API キー + Cookie/Bearer JWT | **ハード削除**（`DeleteVideoUseCase`）。未所有/不在は 404 `Video not found`。DB の FK は ON DELETE CASCADE を持たない（Django が Python 側でエミュレート）ため、**tx で子テーブルを依存順に明示削除**（learnerconceptstate→ploglearningobject→plogedge→plogconcept→plogsummarynode→plogbuildjob→videotag→videogroupmember→video）。commit 後に **ベクトル削除**（`videoq_scenes`）・**R2 オブジェクト削除**（`media/<key>`）・**ストレージ会計**（`used_storage_bytes -= size`, over-quota 条件解除）をすべて best-effort で実行。204 |
| **`GET /.well-known/oauth-authorization-server`(+ optional path)** | 不要 | **RFC 8414 AS メタデータ**（DOT 互換）。`issuer` / authorize / token / register / revoke / introspect / device-authorization、`code_challenge_methods_supported`（plain+S256）、`grant_types_supported`（authorization_code+refresh_token+device_code）、`scopes_supported`（read+introspection）。`Access-Control-Allow-Origin: *` |
| **`GET /.well-known/oauth-protected-resource`(+ `/api/mcp`)** | 不要 | **RFC 9728 PR メタデータ**。`resource=<issuer>/api/mcp/`、`authorization_servers`、`bearer_methods_supported=["header"]`。Claude.ai は bare path も叩くため両方必須 |
| **`GET/POST /api/oauth/authorize/`** | **Cookie JWT**（`access_token`） | **認可＋同意画面**（`CookieAuthorizationView` 相当）。未ログインは `{FRONTEND_URL}/login?next=` へ。同意 HTML は Django テンプレに近い（DCR 警告・redirect host）。POST は `csrfmiddlewaretoken` + PKCE 必須 → `oauth2_provider_grant` 発行して `redirect_uri?code=` |
| **`POST /api/oauth/token/`** | client_id（+ confidential secret） | **トークン発行**。`authorization_code`+PKCE（S256/plain）→ access(1h)+refresh(30d) + `token_checksum`。`refresh_token` は rotate。`urn:ietf:params:oauth:grant-type:device_code` で device poll（pending/denied/expired/tokens）。DOT テーブルを Hyperdrive 経由で共有 |
| **`POST /api/oauth/register/`** | 不要（open DCR） | **RFC 7591 DCR**。public（`token_endpoint_auth_method=none`）は `client_secret` 非返却、confidential は **plaintext secret**（DB は pbkdf2）。`registration_access_token` + `registration_client_uri`。GET `/register/:client_id/` で管理読取 |
| **`POST /api/oauth/revoke_token/`** | client_id（+ secret） | **RFC 7009**。access / refresh を checksum で失効（不明トークンも 200） |
| **`GET/POST /api/oauth/introspect/`** | client 認証 **または** Bearer + `introspection` scope | **RFC 7662**。client 認証成功時は scope 不要（DOT `ClientProtectedScopedResourceView`）。`{active,scope,exp,client_id,username}` |
| **`POST /api/oauth/device-authorization/`** | client_id（device grant アプリ） | **RFC 8628**。`device_code` / `user_code` / `verification_uri` / `interval` |
| **`GET/POST /api/oauth/device/`** 等 | **Cookie JWT** | device HTML（user code → confirm → status）。未ログインは `{FRONTEND_URL}/login?next=` |
| **`GET/POST /api/oauth/applications/*`** | **Cookie JWT** | DOT Applications HTML（一覧・登録・更新・削除）。JWT Cookie（Django session ではない） |
| **`GET/POST /api/oauth/authorized_tokens/*`** | **Cookie JWT** | DOT Authorized tokens HTML（一覧・revoke）。JSON API は従来どおり `/api/oauth/tokens/` |
| **`GET /.well-known/openid-configuration`**（+ `/api/oauth/` prefix） | 不要 | **OIDC Discovery**。`OIDC_ENABLED=true` のときのみ 200（Django `OIDCOnlyMixin`）。`OIDC_RP_INITIATED_LOGOUT_ENABLED` 時は `end_session_endpoint` を掲載 |
| **`GET /.well-known/jwks.json`**（+ `/api/oauth/`） | 不要 | **JWKS**。`OIDC_RSA_PRIVATE_KEY` の公開鍵（RS256）。未設定時は `{"keys":[]}` |
| **`GET/POST /api/oauth/userinfo/`** | Bearer access token | **UserInfo**。scope に応じて `sub` / `preferred_username` / `email`。`OIDC_ENABLED` 必須 |
| **`GET/POST /api/oauth/logout/`** | Cookie JWT（任意） | **RP-Initiated Logout**。`OIDC_RP_INITIATED_LOGOUT_ENABLED` 必須。`id_token_hint` / confirm HTML / token 削除 |
| **`GET /api/oauth/tokens/`** | **Cookie/Bearer JWT のみ** | Settings UI 用の認可済みトークン一覧（`AuthorizedTokensListView`）。`oauth2_provider_accesstoken` の未期限切れを `created DESC` で返す |
| **`DELETE /api/oauth/tokens/:id/`** | **Cookie/Bearer JWT のみ** | トークン失効（`AuthorizedTokenRevokeView`）。所有者のみ削除、成功 204 / 不在・他ユーザー 404 |
| **`POST /api/mcp(/)`** | **OAuth Bearer** + Bearer API キー + ApiKey | **MCP Streamable HTTP**（`MCPEndpointView`, JSON-RPC 2.0）。protocol `2025-03-26` / server `videoq-api@0.2.0`。認証順は Django と同じ。401 に `WWW-Authenticate` + `resource_metadata`。`required_scope=write`。tools: list/get videos·groups·tags、chat history/analytics、evaluation summary/logs（**keywords tool は削除**）。GET=405 / DELETE=204 |
| **`GET /api/media/*`** | API キー + JWT + share_slug | **ProtectedMedia**（Django `X-Accel-Redirect` の置換）。所有/共有グループ認可後に R2 ストリーム（Range 対応）、無ければ署名 GET へ 302 |
| **`GET /api/schema(/)`** | 不要 | **OpenAPI 3 JSON**（drf-spectacular 置換。フロント Developer Docs が fetch） |
| **`GET /api/docs(/)` / `GET /api/redoc(/)`** | 不要 | Swagger UI / ReDoc（CDN + `/api/schema/`） |
| **`GET /api/ops/users(/)`** | **superuser**（API キー or JWT + CSRF） | Django Admin ユーザー一覧代替。`q` で username/email ILIKE |
| **`GET/PATCH /api/ops/users/:id/quota|usage(/)`** | **superuser** | quota 上限・使用量修正（Admin CustomUserAdmin 相当） |
| **`POST /api/ops/embeddings/reindex-all(/)`** | **superuser** | 全件 embedding reindex を SQS 投入（Admin action 相当）。202 `{job_id}` |

> **契約テスト（§13.3）で datetime の罠を回避**: DRF `DateTimeField` は `settings.TIME_ZONE`（America/Chicago）へ変換して出力する（UTC/Z ではない）。実 DRF シリアライザの出力と Worker のレスポンスをバイト比較して確定。`src/utils/datetime.ts` 参照。

> **書き込み系のバリデーション parity**: 入力 serializer は `utils/drf-fields.ts` の `charField` で DRF `CharField.run_validation` を忠実に再現（判定順 blank→null→invalid→max_length、int/float は文字列強制変換、bool は invalid、`trim_whitespace` の有無）。実 Django(DRF 6.x)の `VideoGroupCreate/Update`・`TagCreate/Update/FullUpdate` serializer を全ケース走らせ、エラー文言（`This field is required.` 等）と `validated_data` が **byte 一致**することを確認（`test/drf-fields.test.ts` に固定）。CRUD の SQL は実スキーマに対し `BEGIN … ROLLBACK` で検証（display_order の原子採番・`updated_at` 不変・cascade 順序・無変更を確認）、read 系（tag list/detail）は実データで name 昇順・`video_count`・ネスト videos を確認。ドメイン検証は 404(存在)→400(正規化) の順で実施（`UpdateTagWithDetailUseCase` と一致）。

> **認証系のセキュリティレビュー（codex, 2 回）**: login/logout/csrf/refresh/signup を精査。CRITICAL/HIGH の**移行バグは無し**。反映した修正: ①PBKDF2 salt を Django 準拠の **22 文字（128bit）** に、②`JWT_SECRET` 空の fail-open を **fail-closed**（token/JWT 署名を throw）、③Content-Type を **essence 判定**（`text/plain;x=application/json` 偽装を弾く）、④bigint user_id は **安全整数のみ**（JWT 取り違え防止）、⑤CSRF 応答に `Vary: Cookie`。**Django 由来の設計課題（parity 維持のため未変更・システム全体の判断が必要）**: 検証トークン=リセットトークン（`default_token_generator` 共用）／pre-account-takeover（signup は攻撃者パスワードで inactive user 作成）／enumeration の timing 差（既登録=SELECT のみ / 新規=PBKDF2+INSERT+送信）／メール送信失敗時の inactive user 残置／検証リンクの token をクエリに載せる — いずれも**現行 Django と同一挙動**。email は insert 前に lower 正規化するため大小の一意性ギャップは回避。

> **レート制限（Django SimpleRateThrottle 相当）**: Worker 内でスライディング・ウィンドウを実装（`src/lib/rate-limit.ts` + Durable Object `RateLimiter`）。超過は **429** `{"error":{"code":"LIMIT_EXCEEDED","message":"Request was throttled. Expected available in N seconds."}}` + `Retry-After`。適用: login 5/min、signup/password-reset/email-change 各 3/hour、chat 認証 300/hour、共有 IP 100/hour（messages/completions/share グループ）。`RATE_LIMITER` DO 未バインド時はメモリ実装へフォールバック（unit test）。`chat_share_token_global`(1000/hour) は Django settings のみでコード未使用のため未移植。CF WAF の追加制限は任意の defense-in-depth。

> **RAG チャットのセキュリティレビュー（codex）**: 認可（共有リンク経由で他ユーザーのシーン/グループに到達できないこと・owner は常にグループ所有者）・ベクトル検索の SQL フィルタ・テーブル名 allowlist・pgvector の param 渡し・エラーマスク（SSE 含む）・DB 接続のクローズを精査。**CRITICAL/HIGH の移行バグは無し**（クロステナント漏洩・SQLi の経路なし）。反映した修正: **SSE のクライアント切断シグナル（`c.req.raw.signal`）を OpenAI への fetch まで伝播**（切断後も上流を読み続けてサーバー側キーが課金され続けるのを防ぐ）。**未対応（意図的・Django と同一挙動）**: ①検索結果テキストが system プロンプトの参照セクションに素で入る＝**プロンプトインジェクション**（Django `_build_reference_entries` と同構造。対策する場合は Django も同時に）、②上限チェック → LLM → インクリメントが非原子（Django も同じ）、③messages の件数・長さに上限なし（serializer に定義が無いため）。**運用ゲート（High）はレート制限**で、下記「切替前の必須事項」を参照。

> **history DELETE / CSV / OpenAI completions のセキュリティレビュー（codex）**: 所有者限定・カスケード削除順・Bearer `vq_` vs JWT 分岐・completions の共有無し・`chat_write`/`write` スコープを精査。**CRITICAL/HIGH の移行バグは無し**。**未対応（Django parity）**: CSV の `QUOTE_MINIMAL` は先頭 `=`/`+`/`-`/`@` を引用しないため、共有チャット経由で question に式を仕込まれると所有者が Excel 等で開いたときに**スプレッドシート式インジェクション**になり得る（Django `csv.writer` と同じ。対策する場合は双方同時）。

> **RAG チャットの parity（Phase 2）**: プロンプトは Django の `prompts.json` を **同一ファイルとして `src/lib/prompts/prompts.json` にコピー**し、`build_system_prompt` を移植（`src/lib/prompts/index.ts`）。実 Django の出力と **SHA-256 一致**を確認（default / ja / `ja-JP` フォールバック / group_context / 参照あり無し、`test/prompts.test.ts`）。**Django 側の prompts.json を変更したら必ず両方を更新する**（ハッシュ固定テストが検知する）。ベクトル検索は PoC #01 の判定どおり**直接 SQL**（`embedding <=> $1::vector` の昇順・`user_id` + `video_id = ANY(...)`・k=20）で、標準 LangChain.js の PGVector メタデータフィルタは**採用しない**（VideoQ は `user_id`/`video_id` が独立列で、JSON メタには存在しないため 0 件になる）。実データ（`videoq_scenes`）に対し距離昇順・認可漏れ 0 件・メタデータキーを確認済み。ChatLog / クォータの SQL も実スキーマに `BEGIN … ROLLBACK` で検証（月次リセット→インクリメントの順序、`citations`/`retrieved_contexts` の jsonb 保存）。

> **uid/token リンクと暗号化の interop**: `default_token_generator` / `EmailChangeTokenGenerator` は実 Django 6.0.7 が生成した固定ベクトルと **byte 一致**を確認（`test/django-token.test.ts`: last_login=None / `2026-08-01 15:30:45` / pending_email 込み / 派生違いの取り違え不可）。`last_login` は `to_char(... AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')` が Python の `str(last_login.replace(microsecond=0, tzinfo=None))` と一致することを実 DB で確認。SearchAPI キーの `FernetCipher`（PBKDF2-HMAC-SHA256 480,000 回・salt `videoq-user-secret-key` → AES-128-CBC + HMAC-SHA256）は **実 Python `cryptography` が作った token を WebCrypto 実装が復号でき、同じ IV/timestamp で byte 一致する token を生成**（`test/fernet.test.ts`）。email 変更・SearchAPI キーの SQL は実スキーマに対し `BEGIN … ROLLBACK` で検証（iexact 一致・非アクティブ除外・`pending_email` の保存/確定・`email` の 23505・bytea round-trip）。

> **`file` URL（`src/integrations/media.ts`）**: `USE_S3_STORAGE=false`（wrangler ローカル既定）→ `/api/media/{file_key}`（ProtectedMedia・R2 S3 認証不要。実体は `VIDEO_BUCKET`＝wrangler が `.wrangler/state` に永続化）。`USE_S3_STORAGE=true` → django-storages 互換の R2 presigned GET（aws4fetch SigV4, path-style, `media/` 前置, expire 3600）。本番は **R2 S3 認証情報**（`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_S3_ENDPOINT` / `R2_BUCKET_NAME`）が必要。フロントは `VITE_USE_S3_STORAGE=true` のときだけ署名 PUT 3 ステップ、未設定/false は multipart。

> **ルーティングの教訓**: サブアプリの root `/` ルートを prefix にマウント（`app.route("/api/videos", sub)` + `sub.get("/")`）すると**末尾スラッシュ `/api/videos/` にマッチしない**。フルパスで定義し `app.route("/", sub)` でマウントする（`health`/`videos`/`groups` はこの形）。

### 認証（`src/middleware/auth.ts`）
`requireAuth(...methods)` で DRF の `authentication_classes` と同順に方式を試す合成ミドルウェア。各方式は `absent`（次へ）/ `invalid`（401 で打ち切り）/ `ok` を返す。

| 方式 | 提示 | 実装 |
|---|---|---|
| `apiKeyMethod` | `X-API-Key: vq_...` / `Authorization: ApiKey vq_...` | WebCrypto SHA-256 → `app_userapikey`（`revoked_at IS NULL` + `user.is_active`）照合、`last_used_at` 更新（PoC #03） |
| `bearerApiKeyMethod` | `Authorization: Bearer vq_...` | 同上（keyword=`Bearer`）。`vq_` 以外は absent（JWT/OAuth へ） |
| `oauthBearerMethod` | `Authorization: Bearer <opaque>` | sha256 → `oauth2_provider_accesstoken.token_checksum`（期限切れ・不正は **absent**）。`vq_` は API キー側へ |
| `jwtMethod` | `Authorization: Bearer <jwt>` / Cookie `access_token` | `jose` で HS256 検証（`token_type=access`）。`JWT_SECRET` は Django `SECRET_KEY` と一致必須 |

`/api/auth/me` = `requireAuth(apiKeyMethod, jwtMethod)`（MeView と同順）。`/api/mcp` = OAuth → Bearer API キー → ApiKey。401 は DRF 互換の `{ detail }`（MCP は加えて `WWW-Authenticate`）。

### 書き込み系の基盤（POST/PATCH/DELETE 用ガード）

write ルートは `requireAuth(...)` の後に以下を **チェーンして** 適用する（例: `route.post(path, requireAuth(apiKeyMethod, jwtMethod), csrfProtect, requireScope("write"), handler)`）。いずれも unit + workerd 統合で検証済み。

| ガード | 何を守るか | 実装・検証 |
|---|---|---|
| `csrfProtect`（`src/middleware/csrf.ts`） | **Cookie 認証の非安全メソッド**に Django 互換 CSRF（Bearer/APIキーは対象外） | `verifyDjangoCsrfToken`（32文字 secret / 64文字 masked を正規化して定数時間比較, `src/utils/csrf.ts`）+ Origin/Referer チェック。**実 Django 6.0.7 発行トークンで interop 検証済み**（[codex CSRF レビュー](../docs/architecture/csrf-django-compat-review-codex.md)）。workerd 統合: Cookie+CSRFなし→403 / 一致→200 / 不一致→403 / Bearer→200 |
| `requireScope(scope?)`（`src/middleware/auth.ts`） | **API キーの read_only 制御**（`ApiKeyScopePermission` 相当。JWT/Cookie は素通り） | `isScopeAllowed`（all=全許可 / read_only={read, chat_write}）。既定 scope は安全メソッド=read・他=write。chat 送信は `requireScope("chat_write")` |
| ジョブ投入（`src/lib/jobs.ts`） | 非同期ジョブの**冪等キー基盤**（JR-2 / PoC #02） | `newJobId()`（enqueue ごと UUID, video_id は使わない）+ `buildCeleryJobMessage()`（既存 Lambda が受理する最小 JSON）+ `payloadSha256()`（台帳用）。SQS 送信は方式確定後に追加 |

## ディレクトリ構成

```
src/
├─ index.ts              # エントリ（fetch + scheduled）
├─ app.ts                # Hono 組み立て（Django プロキシ無し）
├─ openapi/openapi.json  # /api/schema 用
├─ types/bindings.ts
├─ middleware/
├─ routes/               # auth, videos, chat, ops, schema, media, ...
├─ db/pool.ts
└─ utils/
test/
```

## 開発

```bash
npm run dev         # wrangler dev（ローカル）
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
npm run cf-typegen  # wrangler types（バインディング型の再生成）
```

### ローカルで /ready を試す
- `/ready` は `wrangler.jsonc` の Hyperdrive `localConnectionString` が指す Postgres に接続する。
  ローカル docker の `videoq-postgres` を使う場合は、ホストのポートへ転送する（例: socat で 55432→5432）。
- **Django プロセスは不要**（運用は `/api/ops/`、ドキュメントは `/api/schema/`）。

### 運用（旧 Django Admin）
superuser の Cookie/Bearer JWT（または API キー）で:
```bash
# quota 設定
curl -X PATCH "$API/ops/users/1/quota/" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"storage_limit_gb":100,"ai_answers_limit":1000}'
# 全件 reindex
curl -X POST "$API/ops/embeddings/reindex-all/" -H "Authorization: Bearer $TOKEN"
```

## バインディング（`wrangler.jsonc`）

| 種別 | binding | 用途 |
|---|---|---|
| Hyperdrive | `HYPERDRIVE` | Neon への接続（本番は `wrangler hyperdrive create` の id を設定） |
| R2 | `VIDEO_BUCKET` | 動画・字幕・サムネイル |
| Durable Object | `RATE_LIMITER` | レート制限カウンタ（class `RateLimiter`）。migration tag `v1-rate-limiter` |
| KV | `STUDY_SESSION` | Study モードのエフェメラル学習者状態（キー `plog:study:ephemeral:<session>`、TTL 12h。本番は `wrangler kv namespace create` の id を設定） |
| vars | `ENVIRONMENT` / `USE_S3_STORAGE` / `CORS_ALLOW_ORIGIN` | 非機密設定（ローカル `USE_S3_STORAGE=false`） |
| vars | `EMBEDDING_MODEL` / `LLM_MODEL` / `PGVECTOR_COLLECTION_NAME` | RAG チャット（既定 `text-embedding-3-small` / `gpt-4o-mini` / `videoq_scenes`） |
| vars | `OAUTH2_PROVIDER_ISSUER_URL` | OAuth AS `issuer`。well-known / DCR / MCP 401 に使う。**公開 HTTPS オリジン** |

機密（JWT 鍵・OpenAI 等）は `wrangler secret` / `.dev.vars`（`.dev.vars.example` 参照）。

## エンドポイント網羅監査（Django URL 解決器 vs Worker ルート）

Django プロキシ廃止後は「Django にあって Worker に無い」= 404 リグレッションになるため、Django の全 URL パターンを解決器で列挙し Worker ルートと機械 diff した。**アプリ機能の全エンドポイントは移行済み**（残差は OAuth プロバイダの裾野のみ）。

- **修正した実ギャップ**: `PUT /api/videos/groups/:id/`（`VideoGroupDetailView.put` 全更新）を追加。
- **OAuth `/api/oauth/.well-known/oauth-authorization-server` / `oauth-protected-resource`**（+ path 変種）: Django は root と `/api/oauth/` の両方で metadata を 200 配信するため、prefix 版のエイリアスを追加（内容は root と同一）。
- **意図的スコープ外**: `PATCH /api/auth/email-verifications`（引数なし版＝Django でも 500 の dead route）。
- **DOT 裾野は移植済み**: `introspect/`・device grant・`applications/*` / `authorized_tokens/*` HTML・**OIDC**（下記。既定 `OIDC_ENABLED=false` で 404＝Django 同条件）。

## スコープ決定（A / B / C / D）

| 選択肢 | 内容 | 本プロジェクトの決定 |
|---|---|---|
| A | Web 完了で止める（Lambda / Drizzle はやらない） | 完了済み（前段） |
| B | Lambda consumer の Workers 化 | 将来構想（Python worker は残置） |
| **C** | Drizzle 全面置き換え + Django 依存切断 | **実施済み**（[`django-cutover.md`](../docs/architecture/django-cutover.md)） |
| D | B + C | B のみ未着手 |

## 残タスク（本番切替のみ）

- **Lambda consumer 残置**（transcription / build_plog / ragas / reindex_*）— 要件どおり Web 層外。Workers 化は B 選択時のみ
- 切替ゲート: `RATE_LIMITER` DO + `STUDY_SESSION` KV の本番 ID、本番 `USE_S3_STORAGE=true` + R2 秘密
- Django API Lambda / 旧 CloudFront API オリジンの停止（Worker を正面に）
