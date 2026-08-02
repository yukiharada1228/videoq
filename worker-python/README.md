# worker-python

Django-free / Celery-free Python worker for VideoQ background jobs.

This package replaces `backend/lambda_handler.py` for SQS → task execution. It
decodes the same Celery-envelope messages produced by Hono (`backend-hono/src/lib/jobs.ts`)
and dispatches tasks by name using plain Python callables — no `django`, `celery`,
or `oauth2_provider` imports.

## Layout

```
worker-python/
  handler.py                    # Lambda entry: handler.handler
  worker_python/
    lambda_handler.py           # SQS batch handler
    db.py                       # psycopg v3 + DATABASE_URL
    contracts.py                # task name strings (must match Hono/backend)
    tasks/
      registry.py               # name → callable
      evaluation.py
      indexing.py
      reindex_video_transcript.py
      reindexing.py
      account_deletion.py
      transcription.py
      build_plog.py
```

## Task names

Task name strings are identical to `backend/app/contracts/tasks.py` and
`backend-hono/src/lib/jobs.ts`. Do not rename them without updating all producers.

| Task | Module |
|------|--------|
| `app.entrypoints.tasks.transcription.transcribe_video` | `transcription.py` |
| `app.entrypoints.tasks.indexing.index_video_transcript` | `indexing.py` |
| `app.entrypoints.tasks.reindex_video_transcript.reindex_video_transcript` | `reindex_video_transcript.py` |
| `app.entrypoints.tasks.reindexing.reindex_all_videos_embeddings` | `reindexing.py` |
| `app.entrypoints.tasks.evaluation.evaluate_chat_log` | `evaluation.py` |
| `app.entrypoints.tasks.account_deletion.delete_account_data` | `account_deletion.py` |
| `app.entrypoints.tasks.build_plog.build_plog_artifacts` | `build_plog.py` |

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | yes | PostgreSQL connection string (psycopg v3) |
| `ENABLE_HEAVY_PIPELINE` | no | Set `1`/`true` to enable FFmpeg/Whisper/LLM paths (stubs when off) |

## Local install

```bash
cd worker-python
pip install -e .
```

## Lambda deploy

1. Build a container or zip with `worker-python` installed (`pip install .`).
2. Set handler to **`handler.handler`** (this repo's top-level `handler.py`).
3. Configure SQS trigger and `DATABASE_URL` (Hyperdrive URL or direct Postgres).
4. Optionally set `ENABLE_HEAVY_PIPELINE=1` once FFmpeg/Whisper/LLM deps are packaged.

Example Dockerfile snippet:

```dockerfile
FROM public.ecr.aws/lambda/python:3.12
WORKDIR /var/task
COPY worker-python/ ./worker-python/
RUN pip install --no-cache-dir ./worker-python
CMD ["handler.handler"]
```

## Migration from backend/lambda_handler.py

`backend/lambda_handler.py` is a thin deprecated shim that re-exports
`worker_python.lambda_handler.handler`. New deploys should point Lambda at
`worker-python/handler.py` directly and stop copying the Django `backend/` tree.

During the transition, install `worker-python` into the legacy image:

```dockerfile
COPY worker-python/ /var/task/worker-python/
RUN pip install /var/task/worker-python
CMD ["lambda_handler.handler"]   # shim re-exports worker_python
```

## Implementation status

- **DB writes**: evaluation scores, video status transitions, account deletion
  cascade, PLOG build job rows — implemented via raw SQL (psycopg).
- **Vector / RAGAS / heavy pipeline**: stubbed with logging and clear TODOs until
  langchain/ragas/FFmpeg deps are packaged for Lambda. Set `ENABLE_HEAVY_PIPELINE`
  to opt into real paths as they are wired.

## Testing message decode locally

```python
import json, base64
from worker_python.lambda_handler import _execute_task

inner = base64.b64encode(json.dumps([[123], {}, {}]).encode()).decode()
body = json.dumps({
    "headers": {"task": "app.entrypoints.tasks.transcription.transcribe_video", "id": "test"},
    "body": inner,
})
_execute_task(body)  # requires DATABASE_URL
```
