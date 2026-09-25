# apps/worker

VideoQ の非同期ジョブを処理する Python worker です。ローカルでは SQS long poll、
本番では AWS Lambda の SQS trigger で実行します。

## ジョブ契約

API は次の native JSON を SQS へ送信します。

```json
{
  "type": "transcribe_video",
  "job_id": "uuid",
  "payload": { "video_id": 123 }
}
```

対応する処理:

| type | 処理 |
|---|---|
| `transcribe_video` | FFmpeg / Whisper / YouTube 文字起こしとシーン分割 |
| `index_video_transcript` | embedding生成と検索用シーンの一括更新（削除・保存を同一トランザクションで実行） |
| `reindex_video_transcript` | 動画単位の再索引 |
| `reindex_all_videos_embeddings` | 全動画の再索引 |
| `evaluate_chat_log` | RAG 応答評価 |
| `delete_account_data` | DB・vector・object storage の削除 |

## 構成

```text
worker_python/
├── lambda_handler.py
├── contracts.py
├── video_sql.py
├── pipeline/
└── tasks/
```

worker は modern schema と native job type のみを使用します。

SQSはat-least-once配送のため、workerは `job_executions.job_id` を15分リースでclaimします。
完了済みの重複配送は処理せず、処理中に停止した配送はリース失効後に再開します。後続ジョブIDも
親ジョブから決定的に生成するため、親の再試行で別の後続処理が増えることはありません。
`0011_job_delivery_guards.sql` をworker更新より先に適用してください。

## 主な環境変数

| 変数 | 用途 |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `SQS_QUEUE_URL` | Amazon SQS / ElasticMQ |
| `OPENAI_API_KEY` | Whisper、LLM、評価 |
| `RAGAS_MAX_TOKENS` | RAGAS評価の1回のLLM呼び出しあたりの出力上限（既定4,096、正の整数。利用モデルの上限以下） |
| `EMBEDDING_PROVIDER` | `openai`（既定）または `ollama` |
| `EMBEDDING_MODEL` | OpenAIは `text-embedding-3-small` が既定。Ollamaでは明示必須（検証構成: `qwen3-embedding:4b`） |
| `USE_S3_STORAGE` | S3 互換 object storage の利用 |
| `R2_BUCKET_NAME` / `R2_S3_ENDPOINT` / `R2_S3_REGION` | R2 bucket / endpoint / region |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 S3 API token（Lambda の `APP_PARAM_NAME` JSON ではこの名前を使う。`AWS_ACCESS_KEY_ID` は実行ロール予約） |
| `DB_PARAM_NAME` / `APP_PARAM_NAME` | SSM SecureString（JSON）。本番 Lambda が起動時に読む |
| `USER_SECRET_ENCRYPTION_KEY` | AES-256-GCM のユーザー秘密復号鍵 |
| `ENABLE_HEAVY_PIPELINE` | 文字起こし等の重量処理を有効化 |

RAGASの参照文章の精度評価は、1ジョブあたり最大4件を同時に検証します。
参照文章を切り捨てず、検索時の順序とRAGASの採点方法を維持します。
これにより、参照文章が多い会話で逐次LLM呼び出しが積み重なり、Lambdaの
15分制限に達する問題を抑えます。いずれかの検証が失敗した場合は、残りの
処理をキャンセルしてからHTTPクライアントを閉じます。

## ローカル実行

```bash
cd apps/worker
pip install -e ".[dev]"
python -m pytest tests/ -q
```

推奨構成:

```bash
docker compose up -d postgres minio minio-init elasticmq worker
docker compose logs -f worker
```

SQS を使わず pending row を処理する場合:

```bash
python scripts/process_pending.py
python scripts/process_pending.py --video-id 83
```

## Lambda image

本番は **linux/arm64** コンテナ（ECR）です。

```bash
docker buildx build --platform linux/arm64 -f Dockerfile -t videoq-worker .
```

handler は `handler.handler` です。機密は SSM SecureString
（`DB_PARAM_NAME` / `APP_PARAM_NAME`）から読み込みます。

## 埋め込みの診断

次元は定数 `EMBEDDING_DIMENSIONS = 1536` で固定し、両providerに1536を要求します。Ollamaは `/api/embed` を使用します。`EMBEDDING_VECTOR_SIZE` は廃止し、残っていても参照しません。

workerの環境変数を設定したPython環境で `python -m worker_python.check_embeddings` を実行すると、設定とDBの宣言型を検証します。`--probe` を付けた場合だけモデル出力も確認します。実モデルへの通信・料金が発生する場合があります。

APIと同じprovider・modelを使ってください。同次元でも異なるモデルのベクトルは混在できません。既存データの移行ツールは未提供です。[設定・診断・移行の制約](../../docs/guides/embeddings.md)を参照してください。
