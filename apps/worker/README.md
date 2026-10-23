# apps/worker

The Python worker processes VideoQ's asynchronous jobs. It uses SQS long polling
locally and runs through an AWS Lambda SQS trigger in production.

On-prem Kubernetes uses `Dockerfile.onprem` and the long-polling
`scripts/run_worker.py` entrypoint. It stops polling on SIGTERM and drains active
work. `SQS_JOB_TIMEOUT_SECONDS` defaults to 840 and must stay below both queue
visibility and the 900-second DB execution lease. Interrupted work remains
unacknowledged for retry. See the [Helm chart](../../charts/videoq/README.md)
for deployment, external queue durability and inference configuration.

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
| `transcribe_video_chunk` | Transcribe a bounded interval and save its result in PostgreSQL |
| `finish_video_transcription` | Join completed intervals and enqueue indexing and visual caches |
| `build_video_visuals` | Build one optional visual cache independently of transcription |
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

Uploaded-video processing also requires `0031_resumable_transcription.sql` and
`0037_resumable_transcription_fallback.sql`.
The parent reserves processing quota once and creates a persisted plan with
1,800-second intervals for Modal or 300-second intervals for OpenAI. Existing
plans keep their recorded interval size when resumed, even after a backend change.
Four SQS lanes process the intervals; each saved checkpoint
enqueues the next interval in its lane. Results and follow-up IDs survive retries,
so delivery failures after saving do not call Whisper again for that interval.
All intervals must be saved before the finalizer joins source-relative timestamps
into SRT. Video deletion, source replacement, and transcript edits fence out stale
results. Checkpoints are deleted by foreign-key cascade when the video is deleted.

## Key environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `SQS_QUEUE_URL` | Amazon SQS / ElasticMQ |
| `OPENAI_API_KEY` | Whisper and embeddings |
| `WHISPER_BACKEND` | `openai` (default), `modal`, or `local` |
| `WHISPER_MODAL_URL` / `WHISPER_MODAL_TOKEN` | Protected Modal API root URL and combined proxy token (`wk-….ws-…`); required when `WHISPER_BACKEND=modal` |
| `EMBEDDING_PROVIDER` | `openai`: hosted/private OpenAI-compatible protocol |
| `EMBEDDING_MODEL` | Defaults to `text-embedding-3-small`; set the actual served alias for a private model |
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

Modal's proxy checks the token before starting the GPU container. The
proxy-authenticated `WhisperService.api` checks the model, response format, and
a 16 MiB audio / 16 MiB + 64 KiB total request limit before transcription.
Authenticated invalid requests can start the GPU container. The former public
URL and separate CPU `secure_api` function are removed. Modal may retain Web
Function inputs and outputs for up to seven days; do not treat deletion from
VideoQ as immediate deletion from Modal. No processing region is pinned by this
configuration.

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

Uploaded sources in object storage are read directly by FFmpeg/ffprobe with HTTP
range requests. The worker does not download the original video to Lambda's 5 GiB
temporary disk. Audio extraction, both visual caches, and visual backfills share
this path; local `MEDIA_ROOT` files are read in place. A fresh signed GET URL is
created for each subprocess, with an expiry longer than its process time limit.
HTTPS verifies the server certificate, network inputs cannot read local files,
and signed URLs are removed from subprocess diagnostics and command logging.

Each uploaded transcription job extracts at most 1,800 seconds of 64 kbps mono MP3
with a 16 MiB file cap and a 300-second subprocess deadline. Modal calls have a
360-second client timeout without automatic retry; other provider calls have a
120-second timeout and at most two retries. If Modal rejects or times out on a long
interval, the worker retries it in 300-second parts. Server errors on long Modal
requests also use that fallback. Completed fallback parts are checkpointed in
PostgreSQL so an SQS retry does not pay to transcribe those parts again. Only
one interval's audio is stored
locally, and the next interval runs in a new invocation. Indexing and the two
optional visual caches have separate jobs; failed visual work cannot lose the
saved transcript. Each invocation still has Lambda's 900-second ceiling, so
unreadable media or unusually expensive intervals can fail and require retry.
`tests/test_remote_media.py` exercises real FFmpeg audio and frame extraction over
HTTP ranges, including a sparse 45.16 GB MP4 with its metadata beyond 5 GiB. This
checks large offsets without transferring or allocating 45 GB during the test;
it is not a benchmark of a real 45 GB recording.

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

To trigger processing of pending rows (real uploaded transcription requires SQS;
YouTube, development placeholders, and indexing can run inline):

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

The default `production` target excludes pip (including its vendored libraries),
uv and the local Runtime Interface Emulator. Lambda provides the Runtime API,
and the locked application dependencies and Runtime Interface Client remain.
For local Lambda emulation, build `--target lambda-local`; the development poller
does not require the emulator. Do not deploy the local target to production.

## Embedding diagnostics

Dimensions are fixed by `EMBEDDING_DIMENSIONS = 1536`. Hosted/private servers
receive `dimensions: 1536` through `/v1/embeddings`. `EMBEDDING_VECTOR_SIZE` has
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

OpenAI-compatible embeddings can use `EMBEDDING_BASE_URL` and a separate
`EMBEDDING_API_KEY`. Unset values retain the shared OpenAI base URL/key. Use the
same model and embedding endpoint in the API and worker. Local llama.cpp/vLLM
recipes and their common acceptance commands are in `charts/videoq-inference/README.md`.
