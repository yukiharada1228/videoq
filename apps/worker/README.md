# apps/worker (async jobs)

Django-free / Celery-free Python worker for VideoQ background jobs.

Decodes the same Celery-envelope messages produced by Hono
(`apps/api/src/lib/jobs.ts`) and runs plain Python callables — no `django`,
`celery`, or `oauth2_provider`.

## Layout

```
apps/worker/
  handler.py
  scripts/
    run_worker.py          # local ElasticMQ/SQS poller (Lambda substitute)
    process_pending.py     # DB drain without SQS
  worker_python/
    lambda_handler.py
    db.py
    contracts.py
    sqs_client.py
    sqs_enqueue.py
    pipeline/          # FFmpeg/Whisper, embeddings, PGVector SQL, PLOG, storage
    tasks/
```

## Task flow

```
transcription → (SQS or inline) indexing → (SQS or inline) build_plog
```

| Task | Implementation |
|------|----------------|
| transcription | Placeholder when `ENABLE_HEAVY_PIPELINE` off; else FFmpeg+Whisper / YouTube → **Otsu scene split** (`pipeline/scene_otsu`) |
| indexing | Embed scenes → `videoq_scenes` (OpenAI or Ollama) |
| reindex_* | Same vector path |
| build_plog | LLM concept inventory + `prerequisite_of` chain |
| evaluation | OpenAI JSON scores (stub fallback without key) |
| account_deletion | SQL cascade + R2/S3/local media delete + vector delete |

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | yes | PostgreSQL (psycopg v3) |
| `ENABLE_HEAVY_PIPELINE` | no | `1` enables FFmpeg/Whisper/YouTube real transcription |
| `OPENAI_API_KEY` | for Whisper/LLM/eval | Also used when `EMBEDDING_PROVIDER=openai` |
| `EMBEDDING_PROVIDER` | no | `openai` (default) or `ollama` |
| `EMBEDDING_MODEL` | no | e.g. `text-embedding-3-small` / `qwen3-embedding:0.6b` |
| `EMBEDDING_VECTOR_SIZE` | no | Must match `videoq_scenes.embedding` dims |
| `OLLAMA_BASE_URL` | no | default `http://127.0.0.1:11434` |
| `SQS_QUEUE_URL` | for queue mode | ElasticMQ `http://127.0.0.1:9324/000000000000/videoq-jobs` or AWS |
| `AWS_REGION` | with SQS | local ElasticMQ: `us-east-1` |
| `AWS_ENDPOINT_URL` / `SQS_ENDPOINT_URL` | optional | override; else inferred from non-AWS `SQS_QUEUE_URL` |
| `USE_S3_STORAGE` | no | `true` → boto3 download/delete (local MinIO / R2) |
| `AWS_STORAGE_BUCKET_NAME` | with S3 | same as Hono `R2_BUCKET_NAME` (`videoq-media`) |
| `AWS_S3_ENDPOINT_URL` | with S3 | MinIO `http://127.0.0.1:9000` or R2 endpoint |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | with S3/SQS | MinIO root (ElasticMQ accepts any) or R2 tokens |
| `AWS_S3_REGION_NAME` | with S3 | MinIO `us-east-1` / R2 `auto` |
| `MEDIA_ROOT` | local files only | when `USE_S3_STORAGE` is false |
| `JWT_SECRET` / `SECRET_KEY` | YouTube key decrypt | Fernet for `searchapi_api_key` |
| `WHISPER_BACKEND` | no | `openai` or `whisper.cpp` |
| `WHISPER_LOCAL_URL` | local whisper | default `http://127.0.0.1:8080` |

## Local install / test

```bash
cd apps/worker
pip install -e ".[dev]"
python -m pytest tests/ -q
```

### Local with Docker Compose (recommended)

本番と同じ **Hono → SQS → worker** 経路。

```bash
# リポジトリルート — infra + worker poller
docker compose up -d postgres minio minio-init elasticmq worker

# 本物の文字起こし（FFmpeg+Whisper+Otsu）を使うとき:
# ENABLE_HEAVY_PIPELINE=1 OPENAI_API_KEY=sk-... docker compose up -d --build worker

# ログ
docker compose logs -f worker
```

別ターミナルで API / フロント:

```bash
cd apps/api && npm run dev           # .dev.vars に MinIO R2_* + ElasticMQ SQS_*
cd frontend && npm run dev           # VITE_USE_S3_STORAGE=true
```

アップロード確定や YouTube 登録で Hono が `SendMessage` → `videoq-worker` が消費。
タスク連鎖（indexing / build_plog）も同じキューへ enqueue される。

ホスト直実行が必要なときだけ `python scripts/run_worker.py`（README 旧手順相当の env を export）。

### Local without SQS (DB drain)

`SQS_QUEUE_URL` 未設定時のフォールバック。pending 行を直接処理:

```bash
python scripts/process_pending.py
python scripts/process_pending.py --video-id 83
```

## Lambda deploy

```bash
docker build -f Dockerfile -t videoq-worker .
# handler: handler.handler
# set DATABASE_URL, embedding vars, OPENAI_API_KEY, SQS trigger
```

## Status

Heavy pipelines are wired (not Django). After Whisper/YouTube SRT, **Otsu scene
splitting** runs (`max_tokens=512`, same as Django `apply_scene_splitting`); on
failure the raw SRT is kept. Full ragas library is not required — evaluation uses
an OpenAI JSON rubric with stub fallback.
