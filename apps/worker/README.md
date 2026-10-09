# apps/worker

The Python worker processes VideoQ's asynchronous jobs. It uses SQS long polling
locally and runs through an AWS Lambda SQS trigger in production.

## Job contract

The API sends the following native JSON to SQS:

```json
{
  "type": "transcribe_video",
  "job_id": "uuid",
  "payload": { "video_id": 123 }
}
```

Supported operations:

| type | Operation |
|---|---|
| `transcribe_video` | FFmpeg / Whisper / YouTube transcription, preserving original subtitle cues |
| `index_video_transcript` | Group cues into search scenes, generate embeddings and atomically replace searchable scenes |
| `reindex_video_transcript` | Reindex a single video |
| `reindex_all_videos_embeddings` | Reindex all videos |
| `delete_account_data` | Delete database records, vectors, and objects in storage |

`payload` is an object containing only the arguments for the job. Video jobs accept
`video_id` as an integer from 1 through JavaScript's maximum safe integer. Strings,
fractions, and booleans are not converted to IDs. Account deletion requires a
nonblank string for `user_id`; reindexing all videos requires an empty object.
The worker applies the same validation when sending and receiving jobs, rejecting
invalid input before acquiring an execution lease. For SQS batches, only invalid
messages are returned as failures; processing continues for the others.

`videos.transcript` stores the original SRT cue timestamps returned by transcription
or a manual edit. Otsu grouping runs during indexing and writes only to
`scene_embeddings`; playback and subtitle-window tools keep the original cues.
Indexing still checks the original saved transcript under the video row lock before
replacing vectors. No database migration is required. Existing grouped transcripts
remain readable, but reindexing cannot recover their lost cue boundaries. Recover
those only from a preserved source transcript or an explicit re-transcription.

## Structure

```text
worker_python/
├── lambda_handler.py
├── contracts.py
├── video_sql.py
├── pipeline/
└── tasks/
```

The worker uses only the modern schema and native job types.

Because SQS delivers messages at least once, the worker claims `job_executions.job_id`
with a 15-minute lease. Completed duplicates are skipped, and interrupted jobs can
resume after the lease expires. Follow-up job IDs are derived deterministically
from the parent job, so retrying a parent does not create extra follow-up jobs.
Apply `0011_job_delivery_guards.sql` before updating the worker.

## Key environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `SQS_QUEUE_URL` | Amazon SQS / ElasticMQ |
| `OPENAI_API_KEY` | Whisper and embeddings |
| `EMBEDDING_PROVIDER` | `openai` (default) or `ollama` |
| `EMBEDDING_MODEL` | Defaults to `text-embedding-3-small` for OpenAI. Required explicitly for Ollama (validated configuration: `qwen3-embedding:4b`) |
| `USE_S3_STORAGE` | Enable S3-compatible object storage |
| `R2_BUCKET_NAME` / `R2_S3_ENDPOINT` / `R2_S3_REGION` | R2 bucket / endpoint / region |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 S3 API token (use these names in Lambda's `APP_PARAM_NAME` JSON; `AWS_ACCESS_KEY_ID` is reserved for the execution role) |
| `DB_PARAM_NAME` / `APP_PARAM_NAME` | SSM SecureString parameters (JSON), read by production Lambda at startup |
| `USER_SECRET_ENCRYPTION_KEY` | AES-256-GCM key for decrypting user secrets |
| `ENABLE_HEAVY_PIPELINE` | Enable heavy processing such as transcription |
| `FFMPEG_PROCESS_TIMEOUT_SECONDS` | Wall-clock time limit for FFmpeg / ffprobe (default: 600 seconds) |
| `MEDIA_PROCESS_CPU_TIME_LIMIT_SECONDS` | CPU time limit for media subprocesses (default: 300 seconds) |
| `MEDIA_PROCESS_MEMORY_LIMIT_MB` | Address space limit for media subprocesses on Linux (default: 2,048 MiB) |
| `MEDIA_PROCESS_OUTPUT_FILE_SIZE_LIMIT_MB` | File size limit for files written by media subprocesses (default: 1,024 MiB) |

Dedicated storage credentials are selected from `R2_ACCESS_KEY_ID` /
`R2_SECRET_ACCESS_KEY` first, then `AWS_S3_ACCESS_KEY_ID` / `AWS_S3_SECRET_ACCESS_KEY`.
Both values in the selected pair must be set; values are never mixed across pairs
or with Lambda execution role credentials. Without dedicated settings, the worker
uses [Boto3's standard credential resolution](https://docs.aws.amazon.com/boto3/latest/guide/credentials.html),
including temporary credentials with `AWS_SESSION_TOKEN`.
For standard Amazon S3, unless a region is explicitly set, the SDK resolves it from
`AWS_DEFAULT_REGION` or the AWS configuration file. Custom endpoints default to `auto`.

R2 credentials loaded from SSM are also selected as a pair. Priority is given to
`R2_*` environment variables, then SSM `R2_*` values, then legacy SSM
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` values. A partially configured selected
pair causes an error. Lambda execution role credentials remain unchanged.
Environment variables are updated only after all SSM parameters have been retrieved
and validated. Empty or non-object JSON, or a missing `DATABASE_URL` in the database
parameter, is not marked as loaded and is retried on the next invocation.
Even when legacy setting names are accepted as input, only the canonical `R2_*`
environment variables are populated.

Media processing limits must be positive integers. Uploads are parsed as individual
video files; playlists and external URL references are rejected. Processing that
exceeds a limit fails and is subject to the existing job retry mechanism.

RAGAS evaluation has been removed. Any remaining `evaluate_chat_log` messages exit
without running AI or database operations.

## Run locally

```bash
cd apps/worker
pip install -e ".[dev]"
python -m pytest tests/ -q
```

Recommended setup:

```bash
docker compose up -d postgres garage garage-init elasticmq worker
docker compose logs -f worker
```

To process pending rows without SQS:

```bash
python scripts/process_pending.py
python scripts/process_pending.py --video-id 83
```

## Lambda image

Production uses a **linux/arm64** container image in ECR.

```bash
docker buildx build --platform linux/arm64 -f Dockerfile -t videoq-worker .
```

The handler is `handler.handler`. Secrets are loaded from SSM SecureString
parameters (`DB_PARAM_NAME` / `APP_PARAM_NAME`).

## Embedding diagnostics

Dimensions are fixed by the constant `EMBEDDING_DIMENSIONS = 1536`, and both providers
are asked for 1536 dimensions. Ollama uses `/api/embed`. `EMBEDDING_VECTOR_SIZE` has
been removed and is ignored if still set.

Run `python -m worker_python.check_embeddings` in a Python environment configured
with the worker's environment variables to validate settings and the database's
declared type. Model output is checked only with `--probe`, which may make requests
to a real model and incur charges.

Use the same provider and model as the API. Vectors from different models cannot be
mixed even when their dimensions match. No migration tool for existing data is
provided. See [configuration, diagnostics, and migration constraints](../../docs/guides/embeddings.md).

## Optional visual cache

By default, transcription of uploaded videos saves sparse representative images
and dense images at approximately 1 FPS. Set `VIDEO_VISUAL_ENABLED=false` to disable
this. The API's `focus_clip` reads dense images only for the requested interval.
Prepare existing videos with `python scripts/prepare_visual_frames.py --video-id 42`.
See the [visual evidence guide](../../docs/guides/visual-evidence.md) for settings,
storage usage, deletion, and accuracy comparisons.
