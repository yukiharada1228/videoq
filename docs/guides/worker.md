---
title: Change asynchronous video processing
description: Job entry points, pipeline implementation, retries, and local verification.
---

# Change asynchronous video processing

Transcription and indexing take time, so the Python worker runs them without blocking API responses. The API submits a job requesting that a video be processed, and the worker consumes it from the queue.

## Processing entry points

| What you want to change | Main location |
|---|---|
| Job types and payloads | `apps/worker/worker_python/contracts.py` |
| Mapping job names to functions | `worker_python/tasks/registry.py` |
| State updates and dispatching the next job | `worker_python/tasks/` |
| Transcription and search implementation | `worker_python/pipeline/` |
| Duplicate execution control | `worker_python/job_execution.py` |
| AWS Lambda entry point | `worker_python/lambda_handler.py` |

All of these files are under `apps/worker/`. Also check the API's message format in [job-message.ts](https://github.com/yukiharada1228/videoq/blob/main/apps/api/src/lib/job-message.ts).

## Message format

```json
{
  "type": "transcribe_video",
  "job_id": "a-uuid-identifying-the-job",
  "payload": {"video_id": 123}
}
```

This illustrates the format. Normally, API operations create jobs; you do not need to submit queue messages manually.

Processing follows `transcribe_video` → `index_video_transcript`. See [video states](../design/state-diagram.md).

## Design for retries

SQS may deliver the same message more than once. The worker uses execution records keyed by `job_id` and time-limited leases to avoid repeating completed work. Follow-up job IDs are also derived from the parent job.

When adding processing, check whether retrying after a partial failure could duplicate data or downstream jobs. This property is called **idempotency**. Swallowing an exception can prevent retries and leave a job in an intermediate state.

## Trace processing locally

Restart a running worker after editing Python code so it reloads the changes. Rebuild the image if dependencies changed.

```bash
docker compose restart worker
```

```bash
docker compose logs --tail=100 worker
docker compose logs -f worker
```

Upload a short video through the UI and follow its video ID in the logs. `Ctrl+C` stops log streaming but leaves the worker running. Transcription and embeddings call the configured external APIs.

See [tests and verification commands](testing.md) for the Python test environment. Connection and model settings are documented in the [worker README](https://github.com/yukiharada1228/videoq/blob/main/apps/worker/README.md).

**Related:** [Job delivery and recovery](../architecture/flowchart.md).
