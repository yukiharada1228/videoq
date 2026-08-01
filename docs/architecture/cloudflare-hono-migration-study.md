# テクニカル実現可能性レポート: VideoQ の Cloudflare 全面移行（Django → Hono/TypeScript）

作成日: 2026-08-01 / 対象: プロジェクトオーナー（移行意思決定用）

---

## 1. エグゼクティブサマリ

**総合判定: 条件付き「段階的（部分）移行を推奨」。全面一括移行（ビッグバン）は見送るべき。** 7ドメインを横断して検証した結果、API/Web層・認証/OAuth・ストレージ/IaC は Cloudflare へ高い確度で移行可能（feasibility: high）である一方、**データ層（pgvector/langchain-postgres）、重量計算（ffmpeg + Whisper）、非同期ジョブ（RAGAS/janome/nltk 等 Python 依存）の3ドメインが移行全体のリスクを支配する**。特に、

- **ffmpeg + Whisper 経路は検証後に feasibility が `low` に格下げ**された。Workers AI Whisper の実用入力上限は主張の24MBではなく**約1MB**（Cloudflare 公式チュートリアルが約1MBチャンク、コミュニティは約4MBで失敗報告）で、1時間動画が2-3コールから**60コール超**に激増する。加えて R2→コンテナのファイル転送不具合（issue #137、未解決）で500MB動画の取り込み経路が未実証。
- **Vectorize は1536次元ハード上限**（2026-08時点も据え置き、検証済み）で、`EMBEDDING_VECTOR_SIZE` が環境変数可変（既定 text-embedding-3-small=1536）であるため、将来 3072次元モデルへ移行すると**Vectorize が一方通行で使用不能**になる片道ドア判断。
- **`langchain-postgres` / psycopg2 / SQLAlchemy / ragas / janome / nltk は Workers では一切動かない**。Hyperdrite で「データ移行ゼロ」でも、RAG/埋め込み/評価の**コードは全面TS書き直し**が必要。

**結論**: 「純Hono/TypeScriptバックエンド」という目標は、評価・build_plog・Whisper等でPythonコンテナを併用しない限り完全には達成できない。データを Postgres+pgvector に残し Hyperdrive 経由で読む「ハイブリッド」を第1フェーズの既定とし、ストラングラーフィグでリスクの低いルート群から段階移行するのが唯一の合理的な道。

---

## 2. 全体アーキテクチャ（移行後の目標構成）

| コンポーネント | 現行 (AWS) | 移行先 (Cloudflare) | 移行難易度 |
|---|---|---|---|
| APIサーバ | Django DRF + Lambda + API Gateway (uvicorn/gunicorn) | Hono (OpenAPIHono) on Workers | 高（Lは大）|
| 非同期ジョブ | Celery + SQS + 専用Lambda worker | Queues（ディスパッチ）+ Workflows（耐久実行） | 中〜高 |
| 重量計算 (ffmpeg) | Lambda (mem 5120MB) の subprocess ffmpeg | **Cloudflare Containers**（Workers isolateは128MBで不可） | **高（要PoC）** |
| 文字起こし | OpenAI Whisper API | Workers AI Whisper（要WER検証）or OpenAI維持 | **高（品質リスク）** |
| リレーショナルDB | PostgreSQL (Neon) | **第1期: Postgres+pgvector を Hyperdrive経由で維持**／第2期: D1検討 | 中（ハイブリッド）|
| ベクトルDB | pgvector (langchain-postgres, 1536次元) | **第1期: pgvector維持**／将来: Vectorize（1536上限に留まる前提）| 中 |
| ストレージ | S3 / R2 (django-storages, 署名付きPUT) | R2（ネイティブbinding + 署名付きPUT継続） | 低（S）|
| 認証(JWT) | SimpleJWT (HS256, SECRET_KEY) | Hono + `jose`（トークン形式無変更で検証可） | 低（S）|
| APIキー | SHA-256ハッシュ | Web Crypto `crypto.subtle`（自明移植） | 低（S）|
| OAuth2 AS | django-oauth-toolkit（DCR/PKCE/RFC8414/9728）| `@cloudflare/workers-oauth-provider` **v0.8.3**（KVバック） | 中（同意画面は自作）|
| メディア配信 | nginx X-Accel-Redirect | Worker（R2ストリーム or 署名付きGET URL） | 低 |
| IaC | Terraform AWS (Lambda×2/APIGW/SQS/CloudFront/ECR/Secrets Manager) | wrangler + CF Terraform provider v5 (≥5.13)、secretsは`wrangler secret bulk` | 中（M）|
| CDN/ルーティング | CloudFront（`/api/*`→APIGW、default→Pages）| Workersルート（CloudFront完全撤去可）| 低 |
| フロントエンド | React 19 + Vite（**既にCloudflare Pages上**）| 変更なし | — |
| 管理画面 | Django Admin (`/api/admin/`) | **Workers等価物なし → 別途スコープ判断** | 未定 |

---

## 3. ドメイン別評価

### 3.1 API / Web層（DRF → Hono）— feasibility: **high** / 工数: **L**

- **推奨**: 約55ルートを OpenAPIHono で書き直し（Zodがバリデーション兼OpenAPIドキュメント化）。3つの認証方式（CookieJWT / APIキー / ShareToken）を順序付きHonoミドルウェアに、`required_scope` をスコープチェックのミドルウェアファクトリに。SSEチャットは `streamSSE` に直マップ。
- **検証済み主要リミット**: Workers Paid CPU 既定30s/最大5分（`cpu_ms=300000`、2025-03-25変更）、クライアント接続中は**wall-clock無制限**、サブリクエスト既定10,000（Paid、Freeは50、2026-02-11変更）、リクエストボディ100MB(Free/Pro)。動画は署名付き直PUTなのでボディ上限に非該当。
- **主要ブロッカーと緩和**:
  - **SSEアイドルタイムアウト（要修正・見落とし注意）**: 「wall-clock無制限」は真だがCloudflareエッジは**約100秒のアイドルタイムアウト**を課す。LLMの初回トークン遅延やチャンク間ギャップが100秒を超えると切断される。**約15-30秒ごとの `:ping` キープアライブ必須**。元評価はこれをTS型の脚注扱いにしていた。
  - **CSRF（medium）**: Djangoのdouble-submit CSRFを自作ミドルウェアで再実装。**OAuth `/authorize` 同意POST（CookieAuthorizationView）**はCookie認証の非安全メソッドで、MCPコネクタが駆動する箇所。明示的なCSRF方針が必要（元評価が漏らしていた）。
  - **レート制限（medium）**: DRFのSimpleRateThrottleスコープをCF Rate Limiting binding / Durable Object（正確）/ KV（近似）へ。login/signup/password-reset等の悪用防御は厳密性が要るためDO推奨。
  - **X-Accel-Redirect（low）**: R2ストリーム or 署名付きGET URLへ置換（むしろ簡素化）。
- **重要な条件**: この「high/L」は**プレゼンテーション層単独**の評価。46.5k LOCのうち約26kに過ぎず、presign/confirm、quota強制、そして後述のffmpeg/pgvector/Celery層が移植できて初めて出荷可能。**単独グレードを全体GOと読んではならない**。

### 3.2 データ層（PostgreSQL + pgvector）— feasibility: **medium** / 工数: **L（ハイブリッド前提）**

- **推奨**: **第1期はハイブリッド**。Postgres+pgvector（Neon/Supabase）を**Hyperdrive経由**で Workers から利用しデータ移行ゼロでカットオーバー。第2期に埋め込みをVectorize、リレーショナルをD1へ任意移行。**D1+Vectorizeのビッグバンはv1で行わない**。
- **検証済み主要リミット**:
  - Vectorize: **最大1536次元（ハード上限、2026-08据え置き確認済み、3072はFeature Request #8729で未GA）**、10M vectors/index、メタデータインデックス最大10、topK 50（メタ付き）。RAGフィルタは `{user_id:$eq, video_id:$in}`, topK=20 で完全適合。
  - **D1: クエリ/呼び出し上限は Paid 1,000 / Free 50（要修正・検証済み）**。元評価は1,000のみ記載。bulk-reindexとPlogグラフ構築はFreeでは50を容易に超えるため、**プラン問わずQueues/Workflowsバッチ化が必須**。ブロッカー深刻度をlow→mediumへ格上げ。
  - Hyperdrive: pgvectorフル対応・スキーマ変更不要、Free 10 configs（**約20 origin接続**）/ Paid 25 configs（約100接続）。クエリ最大60s。
- **主要ブロッカーと緩和**:
  - **【最重要・工数の再定義】** 「Hyperdrive経路はM（接続文字列差し替えのみ）」は誤り。**langchain-postgres/psycopg2/SQLAlchemy はWorkersで動かない**（19箇所が参照）。Hyperdriveが節約するのは**データ移行のみで、RAG/埋め込み/ベクトルアクセスのコードは全面TS書き直し**（postgres.js/node-postgres）。実質工数はM→**L**。
  - **1536次元は片道ドア（high扱いに）**: `EMBEDDING_VECTOR_SIZE` は環境変数可変。3072次元モデルへ行くとVectorizeが恒久的に使えない。**製品として1536以下を維持するコミットが取れない限り、pgvector-via-Hyperdriveをフォールバックでなく既定推奨とすべき**。
  - **OAuth2/JWTテーブル再実装（high）**: D1路線を選ぶとDOT約7テーブル+simplejwt約2テーブル+ORM+41マイグレーションを手作業再実装。ハイブリッドで回避可能。
  - **新規の部分失敗モード**: リレーショナルとベクトルを分離すると「行はコミット済み・ベクトル欠落」という**現行には無かった障害モード**が発生。現状の「delete失敗を握り潰す」パターンは削除のみカバー、**indexing書き込みの部分失敗設計が別途必要**。

### 3.3 非同期ジョブ（Celery+SQS → Queues/Workflows）— feasibility: **medium** / 工数: **XL（Python依存が支配）**

- **推奨**: 1:1ポートでなく Queues（ディスパッチ）+ Workflows（耐久実行）のハイブリッド。各アイテムをWorkflowインスタンス化しステップ単位リトライ/冪等性を得る。reindex_allは単一同期ループ→**コーディネータWorkflow + 動画ごと子インスタンスのfan-out**へ再設計。
- **検証済み主要リミット**: Workflows 10,000ステップ（→25,000）、**ステップ結果1 MiB上限**、step.sleep 365日、CPU 30s→5分、50,000同時インスタンス、状態保持Paid 30日/Free 3日、作成レート300/s。Queues 128KB/msg、100リトライ、15分consumer wall-clock。Containers（2026-04 GA）standard-1で4 GiB RAM。
- **主要ブロッカーと緩和（元評価から重要な訂正）**:
  - **【誤り訂正】build_plog は ffmpeg を使わない**。純langchain（LLM抽出+埋め込み+グラフ計算）。真のブロッカーは**langchain Python依存**であり、transcriptionのコンテナ需要とは別。
  - **【最重要・オープン疑問ではなくブロッカー】RAGAS/janome/nltk/langchain はTS等価物なし**。evaluation（Faithfulness/ResponseRelevancy/LLMContextPrecision）、keyword分析（janome日本語形態素+nltk）、indexing/reindex（langchain-postgres）が該当。**(a)これらをPythonコンテナで動かす（＝純TSバックエンド目標が部分崩壊）か、(b)RAGAS3指標+日本語形態素解析+pgvectorアクセスをTS全面再実装するか**を、**工数見積り前に決定**（L→XLを左右）。
  - **transcription並列性の欠落**: `asyncio.gather` で全音声セグメントを並列Whisper。素朴な逐次Workflowステップ化は2分ジョブを20分超に膨張。**子Workflow/Queueへfan-out or コンテナ内で並列gather**を保持。
  - **instanceId冪等性の罠**: `instanceId=video_id` は完了後も再利用が**拒否**され、正当な再文字起こし/再indexが失敗。試行サフィックス + DB/ベクトル層のdelete-then-insert冪等性が必要。account_deletionは行単位冪等性。
  - **終端状態の忠実移植**: indexing→枯渇後ERROR、evaluation→status='failed'で**再raiseしない**、transcription→型付きスキップ（swallow=ack）/リトライ（ExecutionFailed）/再raise（TargetMissing）。catchをステップ内に置き、NonRetryableErrorで非リトライ化。

### 3.4 重量計算（ffmpeg + Whisper）— feasibility: **low（検証後に格下げ）** / 工数: **XL**

- **推奨**: ffmpeg を Cloudflare Container（standard-2/3）で「メディアワーカー」化しR2から直接取得→<=約24MB MP3分割→R2へ書き戻し。文字起こしは Workers AI Whisper か OpenAI維持を TranscriptionGateway 背後で選択可能に。**ffmpeg.wasm on Worker は不可**（128MB/5分CPU）、**Cloudflare Stream は用途違い**。
- **検証済み主要リミット**: Containers（2026 GA）standard-1〜4（最大4 vCPU/12 GiB/20 GB）、active-CPU $0.00002/vCPU-秒。Workers AI `@cf/openai/whisper-large-v3-turbo` GA $0.00051/音声分、99言語（日本語含む）、**出力はWebVTT（数値start/endは自前パース必須）**。
- **主要ブロッカー（このドメインが移行全体の最難関）**:
  - **【最重要・検証済み】Whisper入力上限が桁違いに過大主張**。元評価は「実用約25MB」だが、**Cloudflare公式チュートリアルは約1MBチャンク**、コミュニティは約4MBで失敗（4分28秒/4200KBでエラー）。実信頼上限は約1MB＝約15-25倍小さい。1時間動画が**60コール超**となり、レート制限（720 req/min）圧・VTT結合・境界語誤りが激増。まず**約1MBを前提に再設計**。
  - **【high・自己矛盾する緩和】R2→コンテナ転送 issue #137**: 10-15MB超でFUSE/署名付きURL/worker-streaming/S3 APIが**全て失敗**（未解決、CF公式修正なし）。元評価の緩和策「S3 API + Rangeで取得」は**既に失敗している4手法の一つ**。500MB動画（`MAX_VIDEO_UPLOAD_SIZE_MB`）の取り込み経路が未実証。**アップロード時の事前分割（動画全体をコンテナに入れない設計）を主設計に**すべき。
  - **【見落とし】Workflowステップ結果1 MiB上限**: 長尺のVTT/文字起こしはインライン受け渡し不可。**R2/D1をポインタ経由で往復**する追加オーケストレーションが必要。
  - **日本語WERギャップ未解決**: VideoQは日本語講義/会議製品。turbo系は速度優先で精度トレードオフ。**whisper-1 verbose_json 置換は品質リスク**であり単なる設定切替ではない。実コンテンツでのWER実測が前提。
  - **コスト「8倍安」は不完全**: OpenAIは gpt-4o-mini-transcribe（$0.003/分）へ切替可能（2倍差）。CF側はcontainer CPU秒+推論+R2 ops+小セグメント化による追加コール数を加算する必要があり、**実ボリュームでの純節約は未定量**。

### 3.5 認証 & OAuth（SimpleJWT + DOT + APIキー）— feasibility: **high** / 工数: **M〜M+**

- **推奨**: (1) JWTは `jose` でHS256検証（**SECRET_KEY共有でトークン形式無変更**）。(2) APIキーはWeb Crypto SHA-256（自明）。(3) OAuth 2.1 ASは `@cloudflare/workers-oauth-provider` を採用。
- **検証済み・訂正事項**:
  - **ライブラリは v0.8.3 が現行**（元評価はv0.2.2で古い）。**RFC 9728 protected-resource metadata と `.well-known` エンドポイントはネイティブ対応**（v0.4.0/v0.2.4）、30日refresh/90日client TTL・`purgeExpiredData()` も内蔵。→ 「自作すべき」項目（RFC 9728ルート、TTL、per-user grant listing/revoke=`listUserGrants()`/`revoke()`）はスコープから除外可。
  - **【high・片道ドア】PBKDF2パリティ**: Django 6.0.7 は PBKDF2-SHA256 **1,200,000回**、Workers `crypto.subtle` は**10万回上限**（workerd #1346、未解決）。既存パスワードハッシュはネイティブ検証不可。緩和は WASM/純JS検証 + ログイン時遅延リハッシュ、または強制リセット。**CPU予算の理解が逆**: PBKDF2は純計算なのでwall-clockでなく**課金対象のCPUを消費**。同時ログイン負荷でDoS増幅要因。ネイティブ10万回パスは約10倍安い。
  - **同意画面は自作**: 約791 LOCの独自OAuth層 + アンチフィッシング用にredirect_uriホストを表示する `authorize.html` を**Worker側HTMLで再構築**が必要（ライブラリは同意画面を提供しない）。
  - **OAuthゲートは1エンドポイントのみ**: OpenAI互換 `/api/v1/chat/completions` は APIKey/Cookie のみ（OAuthなし）。OAuthは `/api/mcp/` のみ。→ リスク/工数を低減。
- **セキュリティ判断**: HS256でSECRET_KEYをエッジWorkerに置くと**Worker侵害＝トークン偽造能力**。カットオーバー前に **RS256/EdDSA（Worker は公開鍵のみ保持）**への切替を推奨。

### 3.6 AI / RAG / 評価 — feasibility: **medium** / 工数: **L**

- **推奨**: RAGチャット+検索とOtsuシーン分割を `@langchain/cloudflare` でHonoへ。OpenAI（text-embedding-3-small 1536次元、gpt-4o-mini）をHTTPS維持で品質保持。ragas（JS版なし）はLLM-as-judge独自プロンプトで再実装。janome→kuromoji.js/TinySegmenter、nltk→wink-nlp/compromise、tiktoken→js-tiktoken。
- **主要ブロッカー（検証後の訂正）**:
  - **【計算量誤表記】Otsu分割は O(N) ではなく O(T²×1536)**: 各 `_find_otsu_threshold` が1536次元sum-of-squaresをτ∈[1,T]で回し、再帰がO(T)ノード訪問。数千行講義で約10^10 float演算・単スレJS。**5分CPU上限リスクはメモリでなくここ**。深刻度low→medium。
  - **【128MBメモリ過小評価】**: numpyのview（`embeddings[start:end+1]`は無コピー）に対しTSの `.slice()` は**再帰ノードごとにコピー**。共有Float32Array上のインデックス範囲操作で回避必須。深刻度low→medium。
  - **サブリクエスト同時実行6**: 全文字起こし埋め込みは batch_size=16 の逐次OpenAIコール。Workersは**外向き同時接続6**（2026も据え置き）。Workflowステップ内で明示的に並列度制御。
  - **ragas再実装（high）**: 3指標の**厳密プロンプト＋スコア集約**をgpt-4o-mini固定で再現し、既存ChatLogEvaluationのゴールデンセットに許容誤差で合わせる研究工数。**歴史スコアは非比較になる前提でメトリクスをバージョニング**。
  - **pgvector→Vectorize移行順序の落とし穴**: メタデータインデックス（user_id/video_id）を**挿入前に作成**必須（作成前挿入分は当該インデックスから除外＝フィルタが静かに壊れる）。
  - **scene_semantic はソース欠落（.pycのみ）**: 使用中なら**移植不能のハードブロッカー**。要確認。

### 3.7 ストレージ / IaC / ロールアウト — feasibility: **high** / 工数: **L（アプリ書き直しに支配される）**

- **推奨**: R2は既に本番ストア。ネイティブR2 binding（read/delete/head）+ ブラウザ直PUT（署名付きS3 URL）を継続。**500MB動画をWorkerで中継しない**。Terraform-AWSをwrangler + CF TF provider v5（≥5.13）へ。secretsは `wrangler secret bulk`（Secrets Store はBeta・安定TFリソースなし）。CloudFront完全撤去。
- **検証済み主要リミット**: R2 単一PUT最大5 GiB、multipartは**全非最終パート同一サイズ必須**（S3より厳格）、オブジェクト最大約4.995 TiB、egress $0、$0.015/GB-月。Workersボディ上限はアカウントプラン依存（Free/Pro 100MB / Business 200MB / Enterprise 500MB）。TF provider #5634のworkers_script bindingバグに注意。
- **訂正事項**:
  - **【誤誘導訂正】サイズ検証は confirm_video_upload には無い**。`confirm_video_upload.py` はUPLOADING→PENDING遷移とキュー投入のみ。実サイズチェック+超過削除は `run_transcription.py:117-124` に存在し**ユーザー別**（`user.get_max_upload_size_bytes()`）。移植先はこのロジック（またはR2 event-notificationハンドラ）。
  - **署名付きPUTはcontent-length-range非対応**（R2、確認済み）。超過オブジェクトが物理的に着地しClass A書込+保管コスト発生。**R2 event-notificationでのサイズガード**を推奨。
  - **DBコミット+キュー投入のアトミック性欠如**: 現行 `confirm_video_upload.py:49-55` は Django atomic ブロック。CFにはPostgresとQueuesを跨ぐアトミックトランザクションが無い。**冪等/アウトボックスパターン**が必要。
  - **OAuthルート群は原子的に移行**: token/authorize/introspect + `.well-known` を分割するとトークン検証が壊れる。**単一ルート群として同時カットオーバー**を固定。

---

## 4. クリティカルな課題・リスク TOP（深刻度順）

1. **【最深刻】ffmpeg + Whisper 経路（feasibility: low）**
   - Whisper実用入力が約1MB（主張の約1/20）→ 60コール超/時間・レート制限圧・境界誤り。
   - R2→コンテナ転送 issue #137 が未解決で500MB取り込みが未実証、推奨緩和策が既失敗手法。
   - 日本語WERギャップ未検証で品質リスク。**PoCで潰すまで移行GOを出せない筆頭**。

2. **【最深刻】データ層＝コードの全面書き直し（feasibility: medium）**
   - langchain-postgres/psycopg2/SQLAlchemy がWorkers非対応。Hyperdriveでもコードは全書き直し（M→L）。
   - Vectorize 1536次元は片道ドア。1536維持コミットが無ければ**pgvector-via-Hyperdriveが既定**。
   - リレーショナル/ベクトル分離で新規の部分失敗モード発生。

3. **【深刻】Python依存の非同期ジョブ（RAGAS/janome/nltk/langchain）（feasibility: medium）**
   - 純TSバックエンド目標を左右。Pythonコンテナ併用 or 3指標+日本語NLP+pgvectorのTS再実装（L→XL）。
   - build_plogのブロッカーはffmpegでなくlangchain（元評価の誤りを訂正）。

4. **【中〜高】OAuth2プロバイダ再実装（feasibility: high だが工数注意）**
   - ライブラリ本体は成熟（v0.8.3）でRFC対応は概ねネイティブ。
   - **PBKDF2 100万回 vs 10万回上限**（片道ドア、要WASM or 強制リセット）、約791 LOC独自層 + アンチフィッシング同意画面の自作、claude.ai/Claude Desktopライブコネクタとのビット互換の統合テストが本質的コスト。

5. **【中】横断的Web層の見落とし**: SSE約100秒アイドルタイムアウト（keep-alive必須）、OAuth同意POSTのCSRF、KV結果整合性（発行直後トークン/APIキー/share-tokenの401回避にDO or Hyperdrive読み）、Django Admin代替なし。

---

## 5. 段階的移行戦略（ストラングラーフィグ）

**原則**: videoq.jp の同一ファーストパーティドメイン上で Django と Hono を並走させ（JWT Cookie/OAuth issuer URLを不変に保つ）、新設のWorkerルータで未移行ルートをレガシーDjango（API Gateway origin）へ、移行済みルートをHonoへ振り分け、ルート単位で即時ロールバック可能にする。

- **フェーズ0（基盤・データ移行ゼロ）**: R2をネイティブbinding化。Postgres+pgvectorをHyperdrive経由でWorkersから到達可能に。CF TF providerで耐久インフラ（R2/Queue/Cron/DNS/routes）をプロビジョン、secretsは `wrangler secret bulk`。Workerルータを新設しCloudFrontを撤去。**この時点でデータは一切動かさない**。

- **フェーズ1（低リスク読み取り系）**: 認証ミドルウェア（JWT/APIキー/ShareToken）+ 読み取り専用ルート（GET系: video一覧、group、tag等）をHonoへ。SSE keep-alive・CSRFミドルウェアを実装。RS256/EdDSA切替判断もここで。

- **フェーズ2（RAGチャット）**: RAG検索+チャットSSE、OpenAI互換エンドポイントをHonoへ。埋め込み/検索コードをTS書き直し（pgvector-via-Hyperdrive維持）。Otsu分割はWorkflowステップ（cpu_ms=300000、共有Float32Array）で。

- **フェーズ3（OAuth/MCP）**: OAuth2 AS + MCPエンドポイントを**単一ルート群として原子的に**カットオーバー。`@cloudflare/workers-oauth-provider` + 自作同意画面。**claude.ai/Claude Desktopライブコネクタで DCR→authorize→token→Bearer challenge 全ループの統合テスト**（受け入れ基準はビット互換、単体テスト不可）。PBKDF2方針を確定。

- **フェーズ4（非同期ジョブ）**: indexing/reindex/evaluation/build_plog をQueues/Workflowsへ。RAGAS/janome/nltk/langchainの去就（Pythonコンテナ or TS再実装）を確定。冪等性・終端状態を忠実移植。

- **フェーズ5（最後・最難関: アップロード/文字起こし）**: ffmpeg Container + Whisper経路。**フェーズ0-4が本番実証されるまで着手せず、Django worker + SQS を並走維持**。事前分割設計・約1MBセグメント・1 MiBステップ結果対応を実装。実動画でのエンドツーエンド検証後にカットオーバー。

- **第2期（任意）**: 埋め込みをVectorize、リレーショナルをD1へ（1536維持コミットとD1移行コスト＝OAuth/JWT/ORM再実装を受容できる場合のみ）。

---

## 6. 未解決の検証項目（移行判断前にPoC/実測で潰すべき）

**必須（GO/NO-GOを左右）**:
1. **Workers AI Whisperの真の信頼入力上限**をArrayBuffer/binaryで実測（約1MB前提で再計画、レート制限・ステップ数予算を再算出）。
2. **issue #137スパイク**: 実500MB動画でR2→コンテナ転送を検証。全4手法が10-15MB超で失敗するなら「動画全体をコンテナに入れる」設計を放棄し**アップロード時事前分割を主設計**に。
3. **日本語WER実測**: `@cf/openai/whisper-large-v3-turbo` vs 現行OpenAI whisper-1（+ gpt-4o-transcribe）を実講義/会議音声で比較。許容できなければCF Whisperは補助のみでコスト論拠が崩壊。
4. **Otsu分割のO(T²×1536)実測**: 本番の最大字幕行数で128MB/300000ms cpu_ms上限に対しCPU+ピークメモリをプロファイル。超過なら事前チャンク or Container移設。
5. **1536次元維持の製品コミット取得**: 取れなければpgvector-via-Hyperdriveを恒久既定に。
6. **RAGAS/janome/nltk/langchainの去就決定**（Pythonコンテナ併用 or TS全面再実装）— 工数L↔XLを左右。

**強く推奨**:
7. **@cloudflare/workers-oauth-provider v0.8.3 のKV grant APIプロトタイプ**: AuthorizedTokensListView相当の {client_name, issued_at, expires_at, scope} をgrant粒度で再構築できるか。RFC 7592クライアント管理カバレッジ確認。
8. **claude.ai/Claude Desktop Remote MCPコネクタとのライブ統合テスト**（DCR→JWT Cookie同意→token→resource_metadata付きBearer challenge）。
9. **PBKDF2ブラストラディウス確認**: 実ログインフローを検査し強制リセット/メールフロー経由で回避可能か。不可なら1.2M回WASM PBKDF2のCPU-ms×ピークログインレートのコスト/DoSを予算化。
10. **本番行数の確認**: videoq_scenes のベクトル数（Vectorize 10M/index上限とテナントnamespace要否）、リレーショナル各テーブル行数（D1 10GB上限）。
11. **実ボリュームでの総コストモデル**: Container active-CPU秒 + Workers AI分 + R2/Workflows ops + 小セグメント化の追加コール vs 現行 Lambda + gpt-4o-mini-transcribe。
12. **RS256/EdDSA vs HS256共有秘密のセキュリティ判断**、**Django Admin (`/api/admin/`) の去就**、**scene_semantic（ソース欠落）の使用状況確認**。

---

**最終所見**: Cloudflareプリミティブの数値リミット自体は多くのドメインで問題にならない（検証済み）。真の障壁は**Pythonエコシステム依存（langchain/psycopg2/ragas/janome/nltk）がWorkersで一切動かないこと**と、**ffmpeg+Whisper重量計算の未実証経路**、そして**Vectorize/PBKDF2の片道ドア判断**にある。「純Hono/TypeScriptバックエンドで全面移行」は、評価・build_plog・文字起こしでPythonコンテナを併用しない限り完全達成できない。データをpgvectorに残すハイブリッドを既定とし、ストラングラーフィグで低リスクから段階移行し、フェーズ5（ffmpeg/Whisper）を最後に据えるのが唯一の合理的な道である。

Sources: [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits), [Whisper chunking tutorial](https://developers.cloudflare.com/workers-ai/guides/tutorials/build-a-workers-ai-whisper-with-chunking/), [Vectorize higher-dimensions feature request #8729](https://github.com/cloudflare/workers-sdk/issues/8729), [Vectorize changelog](https://developers.cloudflare.com/vectorize/platform/changelog/), [Workers subrequests limit changelog 2026-02-11](https://developers.cloudflare.com/changelog/2026-02-11-subrequests-limit)
