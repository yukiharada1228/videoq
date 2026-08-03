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
| `index_video_transcript` | embedding生成と`langchain-postgres` PGVectorStore更新 |
| `reindex_video_transcript` | 動画単位の再索引 |
| `reindex_all_videos_embeddings` | 全動画の再索引 |
| `build_plog` | PLOG 概念・辺・学習オブジェクト構築 |
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

## 主な環境変数

| 変数 | 用途 |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `SQS_QUEUE_URL` | Amazon SQS / ElasticMQ |
| `OPENAI_API_KEY` | Whisper、LLM、評価 |
| `EMBEDDING_PROVIDER` | `openai` または `ollama` |
| `EMBEDDING_MODEL` / `EMBEDDING_VECTOR_SIZE` | `scene_embeddings` と一致するモデル・次元 |
| `USE_S3_STORAGE` | S3 互換 object storage の利用 |
| `AWS_STORAGE_BUCKET_NAME` / `AWS_S3_ENDPOINT_URL` | R2 / MinIO |
| `USER_SECRET_ENCRYPTION_KEY` | AES-256-GCM のユーザー秘密復号鍵 |
| `ENABLE_HEAVY_PIPELINE` | 文字起こし等の重量処理を有効化 |

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

```bash
docker build -f Dockerfile -t videoq-worker .
```

handler は `handler.handler` です。
