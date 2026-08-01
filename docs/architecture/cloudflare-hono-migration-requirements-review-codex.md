## 総合評価

**判定: 重大な欠陥**

Cloudflare Workers + Hono へ段階移行し、Python Worker Lambda・Neon・R2・SQSを当面維持する方向自体には合意できます。しかし、現行文書は以下の中核前提が実装と一致せず、このまま実装計画として承認できません。

- pgvector の物理スキーマが誤っている。
- LangChain.js の標準 PGVector フィルタは現行列配置と互換でない。
- SimpleJWT ブラックリストが存在する前提が誤っている。
- `Video.status` の列挙値が誤っている。
- `job_id` 冪等性や統一的な失敗状態は現行実装に存在しない。
- quota・OAuthトークン継続性・メールトークン・管理運用が移行要件からほぼ落ちている。
- 技術検討レポートと要件定義書で、Python Worker Lambdaを残すのか最終的にCloudflareへ移すのかが矛盾している。

「Cloudflare移行が不可能」という意味ではなく、**方針は成立するが、現在の要件ベースラインが実装着手に耐えない**という評価です。

---

## 1. §2「現行実装の事実」の照合

### D1 認証: 概ね正しいが「3系統」では不十分

APIキーとCookie JWTが全体の既定認証なのは事実です。

- `[backend/videoq/settings.py:327](/Users/yukiharada/dev/videoq/backend/videoq/settings.py:327)`  
  `APIKeyAuthentication` → `CookieJWTAuthentication` の順。
- `[backend/app/presentation/common/authentication.py:123](/Users/yukiharada/dev/videoq/backend/app/presentation/common/authentication.py:123)`  
  JWTはBearerヘッダーを先に検証し、Cookieの場合だけCSRFを適用する。
- `[backend/app/presentation/common/authentication.py:112](/Users/yukiharada/dev/videoq/backend/app/presentation/common/authentication.py:112)`  
  CSRFは非安全メソッドかつCookie認証時のみ。

ただし、文書の「Cookie JWT + APIキー + OAuth2の3系統」は全認証実態を表していません。

- Share認証が別にあり、`share_slug` または旧 `share_token` をクエリパラメータから受けます。  
  `[backend/app/presentation/common/permissions.py:14](/Users/yukiharada/dev/videoq/backend/app/presentation/common/permissions.py:14)`
- MCPはOAuth限定ではなく、OAuth・Bearer APIキー・`X-API-Key` の3方式を受けます。  
  `[backend/app/presentation/mcp/views.py:45](/Users/yukiharada/dev/videoq/backend/app/presentation/mcp/views.py:45)`

したがってD1は「主要3系統」なら正しいものの、ルート別認証マトリクスとしては不完全です。

### D2 Celery over SQS: 本番については正しいが、Workerの性質が違う

本番Terraformは `sqs://`、`videoq-worker`、`predefined_queues` を設定しています。

- `[backend/videoq/settings.py:442](/Users/yukiharada/dev/videoq/backend/videoq/settings.py:442)`
- `[backend/videoq/settings.py:463](/Users/yukiharada/dev/videoq/backend/videoq/settings.py:463)`
- `[infra/locals.tf:31](/Users/yukiharada/dev/videoq/infra/locals.tf:31)`

ただし、開発既定値はRedisです。  
`[backend/videoq/settings.py:71](/Users/yukiharada/dev/videoq/backend/videoq/settings.py:71)`

さらに重要なのは、SQS消費側が通常のCelery workerではなく、Celeryメッセージを部分的に解釈する独自Lambdaであることです。

- `[backend/lambda_handler.py:19](/Users/yukiharada/dev/videoq/backend/lambda_handler.py:19)`  
  worker loopを起動せず `task.apply()` で同期実行。
- `[backend/lambda_handler.py:77](/Users/yukiharada/dev/videoq/backend/lambda_handler.py:77)`  
  SQS bodyが直接JSONならそのまま読み、失敗時だけ外側base64を復号。
- `[backend/lambda_handler.py:82](/Users/yukiharada/dev/videoq/backend/lambda_handler.py:82)`  
  実際に必要なのは `headers.task`、`headers.id`、base64化された内側bodyだけ。

したがって「raw業務JSONでは動かない」は正しい一方、「完全なCelery workerとの互換が必要」という説明は過大です。

### D3 pgvector: 明確な誤り

文書の `langchain_pg_collection` / `langchain_pg_embedding` は使われていません。

現行は `langchain-postgres` のv2 APIで、`PGVECTOR_COLLECTION_NAME` をそのまま物理テーブル名にしています。

- `[backend/app/infrastructure/external/vector_store.py:77](/Users/yukiharada/dev/videoq/backend/app/infrastructure/external/vector_store.py:77)`  
  collection name = table name。
- `[backend/app/infrastructure/external/vector_store.py:97](/Users/yukiharada/dev/videoq/backend/app/infrastructure/external/vector_store.py:97)`  
  `init_vectorstore_table(table_name="videoq_scenes", ...)`。
- `[backend/app/infrastructure/external/vector_store.py:100](/Users/yukiharada/dev/videoq/backend/app/infrastructure/external/vector_store.py:100)`  
  `user_id` と `video_id` を独立したINTEGER列として作る。
- `[backend/videoq/settings.py:636](/Users/yukiharada/dev/videoq/backend/videoq/settings.py:636)`  
  テーブル名既定値は `videoq_scenes`。

実質的なスキーマは次です。

```text
public.videoq_scenes
  langchain_id UUID PRIMARY KEY
  content TEXT NOT NULL
  embedding vector(1536) NOT NULL
  user_id INTEGER
  video_id INTEGER
  langchain_metadata JSON
```

ベクトルテーブルはDjango migrationで作られず、ランタイムで自動作成されます。migrationが作るのはvector extensionとDjango cacheだけです。  
`[backend/app/migrations/0020_enable_pgvector_and_cache_table.py:22](/Users/yukiharada/dev/videoq/backend/app/migrations/0020_enable_pgvector_and_cache_table.py:22)`

§2 D3と§6.3は全面修正が必要です。

### D4/D5 API範囲: 概ね正しいが、機能契約が不足

ルート範囲が広いという指摘自体は正しいです。  
`[backend/videoq/urls.py:31](/Users/yukiharada/dev/videoq/backend/videoq/urls.py:31)`

ただし、単にルート名を列挙するだけでは移行契約になりません。OpenAI互換・MCP・Share認証には後述の特殊な挙動があります。

### D6 Otsu計算量: 「最悪時」と明記すべき

一回の `_find_otsu_threshold` は各候補分割点で1536次元演算を行います。  
`[backend/app/infrastructure/scene_otsu/splitter.py:21](/Users/yukiharada/dev/videoq/backend/app/infrastructure/scene_otsu/splitter.py:21)`

再帰分割が極端に偏れば `O(T²×1536)` ですが、均衡分割ならより小さくなります。D6は「最悪計算量」と限定すべきです。

### D7 実サイズ検証: 正しい

申告サイズは署名URL発行前、実サイズは文字起こし開始時に検証しています。

- `[backend/app/use_cases/video/request_video_upload.py:76](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/request_video_upload.py:76)`
- `[backend/app/use_cases/video/run_transcription.py:117](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/run_transcription.py:117)`

### §6.2の追加誤り

- 実際の状態は `uploading/pending/processing/indexing/completed/error` です。文書の `failed` は誤りです。  
  `[backend/app/infrastructure/models/video.py:28](/Users/yukiharada/dev/videoq/backend/app/infrastructure/models/video.py:28)`
- `rest_framework_simplejwt.token_blacklist` は `INSTALLED_APPS` にありません。  
  `[backend/videoq/settings.py:197](/Users/yukiharada/dev/videoq/backend/videoq/settings.py:197)`
- refresh token失効処理は空実装です。  
  `[backend/app/infrastructure/auth/simplejwt_gateway.py:43](/Users/yukiharada/dev/videoq/backend/app/infrastructure/auth/simplejwt_gateway.py:43)`
- `BLACKLIST_AFTER_ROTATION=False` です。  
  `[backend/videoq/settings.py:358](/Users/yukiharada/dev/videoq/backend/videoq/settings.py:358)`

よってAU-1の「ブラックリスト検証」は現行互換ではなく、新規セキュリティ要件です。互換要件と改善要件を分離すべきです。

---

## 2. §9 非同期ジョブ方式

### タスク登録・投入経路

7タスク名は文書と一致します。  
`[backend/app/contracts/tasks.py:12](/Users/yukiharada/dev/videoq/backend/app/contracts/tasks.py:12)`

Celeryは `app.entrypoints` のみをautodiscoverし、Lambdaでも明示登録しています。

- `[backend/app/celery_config.py:21](/Users/yukiharada/dev/videoq/backend/app/celery_config.py:21)`
- `[backend/lambda_handler.py:34](/Users/yukiharada/dev/videoq/backend/lambda_handler.py:34)`

通常投入は `transaction.on_commit()` 後の `current_app.send_task()` です。  
`[backend/app/infrastructure/tasks/task_gateway.py:23](/Users/yukiharada/dev/videoq/backend/app/infrastructure/tasks/task_gateway.py:23)`

### 方式Bは実現可能か

**実現可能です。難易度は文書が示唆するより低いです。**

Celery v2の公式形式は `headers.task/id` と `[args, kwargs, embed]` bodyです。  
[Celery 5.6 Message Protocol v2](https://docs.celeryq.dev/en/stable/internals/protocol.html)

現行Lambdaはそのうち以下しか読んでいません。

```text
headers.task
headers.id
base64(JSON.stringify([args, kwargs, embed]))
```

`properties`、`eta`、`expires`、`retries`、`root_id` 等は無視します。外側JSONもbase64化せず送れます。WorkersでUUID生成、JSON化、UTF-8/base64化、SigV4 `SendMessage` を行うことは十分可能です。

ただし次が必須です。

- 現物Celeryメッセージをgolden fixtureとして固定する。
- `celery>=5.5.3`、`langchain-postgres>=...` のような下限指定をやめ、プロトコル依存バージョンをlockする。  
  `[backend/requirements.txt:2](/Users/yukiharada/dev/videoq/backend/requirements.txt:2)`
- 7タスクすべてでWorkers→SQS→Lambdaの統合試験を行う。
- Lambdaが無視している再試行情報やCelery `retry()` の実挙動も試験する。`task.apply()` は通常のCelery consumerとは異なります。  
  `[backend/lambda_handler.py:94](/Users/yukiharada/dev/videoq/backend/lambda_handler.py:94)`

### A→B推奨の評価

- **初期A:** ストラングラー期間に既存Djangoルートをそのままプロキシするなら妥当です。ただし、ジョブ投入専用の新しい薄APIを追加すると、内部認証・AWS/Cloudflare間遅延・再試行時の二重投入が増えます。既存ルートが残る間は別ディスパッチAPIを新設する必要性は低いです。
- **最終B:** 技術的には可能ですが、推奨最終形としては弱いです。
- **最終C:** 現行LambdaがすでにCeleryエンベロープを独自解釈するアダプタなので、`version/task/job_id/args` のplain JSON分岐を追加する方が、WorkersをCelery/Kombu形式から切り離せます。移行中はCelery形式とJSON形式を両方受ければよく、改修量も小さいです。

したがって推奨は、**初期は既存Django経由、最終はC。Lambda変更が絶対禁止の場合だけB**です。

### JR-2/JR-4は未実装

`job_id` をDBで照合する処理や処理済み台帳は存在しません。LambdaはCelery task IDを実行に渡すだけです。  
`[backend/lambda_handler.py:82](/Users/yukiharada/dev/videoq/backend/lambda_handler.py:82)`

重複配信には具体的な危険があります。

- 初回indexは既存ベクトルを削除せず `add_texts()` するため、再実行で重複します。  
  `[backend/app/infrastructure/external/scene_indexer.py:37](/Users/yukiharada/dev/videoq/backend/app/infrastructure/external/scene_indexer.py:37)`
- 個別reindexはdelete後insertなので、途中失敗するとベクトルが空になります。  
  `[backend/app/use_cases/video/reindex_video_transcript.py:44](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/reindex_video_transcript.py:44)`
- 全件reindexは最初に全削除し、個別失敗を記録してもタスク全体を `completed` として返します。  
  `[backend/app/use_cases/video/reindex_all_videos.py:44](/Users/yukiharada/dev/videoq/backend/app/use_cases/video/reindex_all_videos.py:44)`
- アカウント削除は各ステップの例外を握り潰して最後まで成功扱いになります。  
  `[backend/app/use_cases/auth/delete_account_data.py:25](/Users/yukiharada/dev/videoq/backend/app/use_cases/auth/delete_account_data.py:25)`

JR-2/JR-4は「維持すべき現行仕様」ではなく、別途設計・実装が必要な新機能です。

---

## 3. pgvector / LangChain.js互換

### 互換な部分

LangChain.js側で以下を指定すれば、基本的な読取列とcosine距離は合わせられます。

```text
tableName: videoq_scenes
idColumnName: langchain_id
contentColumnName: content
vectorColumnName: embedding
metadataColumnName: langchain_metadata
distanceStrategy: cosine
skipInitializationCheck: true
```

LangChain.js PGVectorは列名のカスタマイズと `skipInitializationCheck` を持っています。  
[LangChain.js PGVector実装](https://github.com/langchain-ai/langchainjs/blob/main/libs/langchain-community/src/vectorstores/pgvector.ts)

### 非互換な部分: metadata filter

現行Pythonは `user_id` と `video_id` を独立列へ保存し、その2キーをJSON metadataから除外します。

- `[backend/app/infrastructure/external/vector_store.py:120](/Users/yukiharada/dev/videoq/backend/app/infrastructure/external/vector_store.py:120)`
- `[backend/app/infrastructure/external/scene_indexer.py:47](/Users/yukiharada/dev/videoq/backend/app/infrastructure/external/scene_indexer.py:47)`

一方、LangChain.jsの標準 `buildFilterClauses()` は、全フィルタを次の形でJSON列に掛けます。

```sql
langchain_metadata ->> 'user_id'
langchain_metadata ->> 'video_id'
```

現行行の `langchain_metadata` にはこの2値が入らないため、**標準LangChain.js PGVectorで現行と同じフィルタ検索はできません**。

### DR-3も現行スキーマでは直接満たせない

現在のベクトル行には以下しかありません。

- 直接列: `user_id`, `video_id`
- JSON: title、start/end、scene index等

`group_id`、削除フラグ、処理完了フラグは保存していません。現在はgroupをリレーショナルDBで動画ID一覧へ解決し、そのID配列とuser IDで検索しています。  
`[backend/app/infrastructure/external/rag_service.py:153](/Users/yukiharada/dev/videoq/backend/app/infrastructure/external/rag_service.py:153)`

よってDR-3は次のいずれかへ改める必要があります。

1. 先にPostgresのVideo/Groupテーブルから認可済み・completed動画IDを取得し、直接列 `user_id` / `video_id` でベクトル検索する。
2. ベクトル検索SQLでVideo/GroupテーブルをJOINする。
3. 保存側スキーマを変更する。ただしDR-1と矛盾する。

初期移行なら1または2が妥当です。

### 推奨実装

このケースでは、標準LangChain.js PGVectorを無理に使うより、Repository内の直接SQLを第一候補にすべきです。

```sql
SELECT
  content,
  langchain_metadata,
  user_id,
  video_id,
  embedding <=> $1::vector AS distance
FROM videoq_scenes
WHERE user_id = $2
  AND video_id = ANY($3::int[])
ORDER BY embedding <=> $1::vector
LIMIT 20;
```

加えて、リポジトリにはHNSW/IVFFlat index定義がありません。実DBに手動indexがある可能性は残るため、PoCでは `pg_indexes` と `EXPLAIN (ANALYZE, BUFFERS)` の確認が必要です。

### Hyperdrive接続設計の誤り

要件§11.4の「接続を共通モジュールで管理し、再生成しない」は、ライブなClient/Poolをglobal共有する意味なら誤りです。CloudflareはDB Clientをリクエストごとに生成し、リクエスト間で再利用しないよう明示しています。  
[Cloudflare Hyperdrive接続例](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/)  
[Hyperdriveのstale connection対策](https://developers.cloudflare.com/hyperdrive/observability/troubleshooting/#stale-connection-and-io-context-errors)

共通化するのは接続ファクトリとRepository設定までにし、Clientはリクエストスコープにすべきです。Stock LangChain.js PGVectorが `Pool` を要求する点も、Hyperdrive上でPoCが必要な理由になります。

---

## 4. 見落としているブロッカー・リスク

### 1. quotaは中核ドメインだが要件から欠落

利用上限と使用量はUserに直接保存されています。初期値は0です。  
`[backend/app/infrastructure/models/user.py:25](/Users/yukiharada/dev/videoq/backend/app/infrastructure/models/user.py:25)`

ストレージ予約は条件付きUPDATEで競合を防いでいます。  
`[backend/app/infrastructure/repositories/django_subscription_repository.py:57](/Users/yukiharada/dev/videoq/backend/app/infrastructure/repositories/django_subscription_repository.py:57)`

一方で、

- 署名URL発行時に申告サイズを先取り予約する。
- アップロード放棄時の自動解放がない。
- AI回答使用量の記録失敗は握り潰される。  
  `[backend/app/use_cases/chat/send_message.py:220](/Users/yukiharada/dev/videoq/backend/app/use_cases/chat/send_message.py:220)`
- 月次リセットはアクセス時の遅延処理。

という実装です。Hono移行時に単純なCRUDとして扱うと、無料利用や二重課金が発生します。

### 2. Stripeは現行機能ではない

Stripe列を持つSubscriptionは過去に追加されましたが、後のmigrationで削除されています。

- `[backend/app/migrations/0026_add_subscription.py:15](/Users/yukiharada/dev/videoq/backend/app/migrations/0026_add_subscription.py:15)`
- `[backend/app/migrations/0033_user_ai_answers_limit_user_is_over_quota_and_more.py:63](/Users/yukiharada/dev/videoq/backend/app/migrations/0033_user_ai_answers_limit_user_is_over_quota_and_more.py:63)`

現在のruntimeにStripeルート・SDK・Webhookはありません。したがって「Stripe移行」は対象外ですが、**quotaをStripe課金と誤認して省略してはいけません**。

### 3. Django Adminは任意ではなく現行運用機能

Adminでユーザー上限・使用量を設定し、全ベクトル再indexも起動しています。

- `[backend/app/admin.py:40](/Users/yukiharada/dev/videoq/backend/app/admin.py:40)`
- `[backend/app/admin.py:104](/Users/yukiharada/dev/videoq/backend/app/admin.py:104)`

新規Userのquota既定値が0なので、Adminを廃止するなら少なくともquota設定・利用量修正・reindex起動・ジョブ状態確認の代替が必要です。

### 4. JWT/OAuth/メールの「既存トークン継続性」

- HS256→RS256/EdDSAは「トークン形式を変えずに」実施できません。旧HSトークンを有効期限まで二重検証するか、全セッション失効が必要です。
- 現行JWTには明示的なissuer/audience設定がなく、user IDも`sub`ではなくSimpleJWTのuser ID claimです。  
  `[backend/app/infrastructure/auth/simplejwt_gateway.py:20](/Users/yukiharada/dev/videoq/backend/app/infrastructure/auth/simplejwt_gateway.py:20)`
- django-oauth-toolkitからKVベースOAuth Providerへ切り替える場合、既存DCR client・access token・refresh token・grantをどうするかが未定です。ライブ新規認可試験だけでは不足します。
- メール確認・パスワードリセットはDjangoの `default_token_generator` に依存し、password、last_login、email、SECRET_KEY等からトークンを作ります。  
  `[backend/app/infrastructure/common/email.py:19](/Users/yukiharada/dev/videoq/backend/app/infrastructure/common/email.py:19)`

メール配送サービスだけ置換しても、カットオーバー前に発行済みのリンクは検証できません。

### 5. Share slugは秘密トークンではない

Share認証値はユーザーが指定可能な最大64文字のslugで、期限やランダム性の保証がありません。  
`[backend/app/infrastructure/models/video_group.py:25](/Users/yukiharada/dev/videoq/backend/app/infrastructure/models/video_group.py:25)`

クエリパラメータ認証なのでログ・履歴・Refererへの露出も考慮が必要です。現行互換を維持するなら、少なくともshare専用レート制限とログマスキングを受入条件にすべきです。

### 6. OpenAI互換APIは完全互換ではない

`temperature/max_tokens/top_p/stream` は受け入れるだけで無視されます。  
`[backend/app/presentation/chat/serializers.py:25](/Users/yukiharada/dev/videoq/backend/app/presentation/chat/serializers.py:25)`

レスポンスusageも常に0で、`stream=true` でも非ストリーミングです。  
`[backend/app/presentation/chat/views.py:592](/Users/yukiharada/dev/videoq/backend/app/presentation/chat/views.py:592)`

「現行の限定互換を忠実移植する」のか「OpenAI SDK互換を改善する」のかを契約として分離すべきです。

### 7. APIキー認証は毎回DB書き込みを行う

認証成功ごとに `last_used_at` を更新します。  
`[backend/app/infrastructure/auth/api_key_resolver.py:9](/Users/yukiharada/dev/videoq/backend/app/infrastructure/auth/api_key_resolver.py:9)`

読み取りAPIでも書き込みが発生するため、Hyperdriveキャッシュ・負荷・失敗時挙動を設計に含める必要があります。

### 8. 技術検討レポートと要件定義書のスコープが矛盾

要件定義書はPython Worker Lambda、Whisper、Plog、ragas、pgvector書込を残すとしています。  
`[cloudflare-hono-migration-requirements.md:21](/Users/yukiharada/dev/videoq/docs/architecture/cloudflare-hono-migration-requirements.md:21)`

一方、技術検討レポートのフェーズ4/5はQueues/Workflows、Containers、Workers AI Whisperへ最終移行する計画です。  
`[cloudflare-hono-migration-study.md:158](/Users/yukiharada/dev/videoq/docs/architecture/cloudflare-hono-migration-study.md:158)`

今回の移行対象なら要件定義書側を正とし、検討レポートのCloudflare全面移行部分は「将来構想」と明記して実装ゲートから外すべきです。

---

## 最優先PoC・検証項目

1. **実DBでのpgvectorクロスランタイム検索**
   - `videoq_scenes` の実DDL・index・件数を採取。
   - Pythonで保存した同一データをWorkers/Hyperdriveから検索。
   - LangChain.js標準実装と直接SQLを比較。
   - `user_id`、複数`video_id`、認可外動画、top-20順位、distance、P95、`EXPLAIN`を確認。
   - 成功基準を満たさなければ最初から直接SQLを採用。

2. **SQS投入方式C/Bと冪等性のE2E**
   - 実Celeryメッセージをfixture化。
   - Workers→SQS→Lambdaで7タスクを起動。
   - 同一`job_id`の二重配信、可視性タイムアウト後の再配信、Lambda失敗、DLQを試験。
   - 結果に基づき、原則C、Lambda変更不可ならBを決定。

3. **認証状態のカットオーバー互換**
   - 発行済みCookie JWT、refresh token、Bearer JWT、APIキー、share slugを新旧両経路で検証。
   - HS256→RS/EdDSAの二重検証期間を実証。
   - OAuth既存client/tokenの移行または再認可方針を確定。
   - 発行済みメール確認・パスワードリセットリンクの継続可否も含める。

4. **quota・アップロード競合試験**
   - 並行した署名URL発行、アップロード放棄、申告サイズとR2実サイズの差、confirm二重実行を試験。
   - 予約解放・期限切れreconciliation・使用量更新失敗時の補償を決める。

5. **API/運用契約テスト**
   - OpenAI `stream`、MCP batch/notification/末尾スラッシュ、各認証方式、share rate limitをgolden test化。
   - Django Adminを廃止する前にquota設定、使用量修正、reindex、ジョブ/DLQ確認の代替を用意する。

ファイルは編集していません。