---
title: Troubleshooting
description: Where to look when startup, login, video processing, or search fails.
---

# Troubleshooting

First identify which parts are working: frontend, API, database, and video processing. You do not need to recreate the database as a first step.

## Three things to check first

```bash
docker compose ps -a
docker compose logs --tail=100 migrate api worker
curl -i http://localhost/ready
```

Exit code `0` for `migrate` and `minio-init` is normal. If `/health` succeeds but `/ready` fails, the API is responding; check DB connectivity and migrations next.

## The UI does not open or reflect changes

| Symptom | What to check |
|---|---|
| `localhost` does not open | Whether `gateway` and `web` are running, and whether another app uses port 80 |
| The UI opens but API calls fail | `/health`, `/ready`, and `api` logs |
| Edits do not appear | `localhost` serves a static build. Start `web-dev` and open `localhost:3000` |
| The server cannot start on port 3000 | Whether Compose's `web-dev` and host Vite are both running |
| Documentation search does not work | Run `npm run build:docs`, then check with `npm run preview:docs` |

## Login fails

In a local environment without email configured, check the [account promotion step in setup](../getting-started/local-setup.md). You must sign up before the account can be promoted.

For migrated local accounts showing `Password not found`, use this recovery command:

```bash
npm run user:password:local --workspace @videoq/api -- your-username
```

It displays a temporary local password. Do not apply this procedure directly to shared or production login issues.

If login attempts hit the local rate limit, stop the API, reset the RateLimiter's local state, and restart the API. See [reset-rate-limit.sh](https://github.com/yukiharada1228/videoq/blob/main/apps/api/scripts/reset-rate-limit.sh) for its requirements.

## Video processing is stuck

Record the video ID and status, then inspect the `worker` logs.

| State or symptom | What to check |
|---|---|
| Stuck in `uploading` | Browser-to-MinIO upload, port 9000, and the upload completion notification |
| Stuck in `pending` | Whether `worker` and `elasticmq` are running, and API job delivery logs |
| Failure during `processing` | Audio availability, FFmpeg/Whisper logs, and AI keys |
| Failure during `indexing` | Embedding model and dimensions, DB connectivity, and worker exceptions |
| Only YouTube imports fail | The SearchAPI key in settings and subtitles for the requested video |
| Rejected for size or usage | Upload limits, storage capacity, and monthly usage in Admin |

See [video state transitions](../design/state-diagram.md) for the meaning of each state.

## Search fails or answers have no citations

1. Check that the course you are asking about contains the video.
2. Check that the video is `completed` and has a transcript.
3. Compare API and worker `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` using the [embedding diagnostic commands](embeddings.md). Dimensions are fixed at 1536. Check the logged reason for configuration, schema, output, or stored PLOG data errors.
4. Reindex after changing models. Configuration alone cannot change the dimensions of existing data.

Questions about course names or video counts may be answered from metadata without scene citations. Even content questions may not produce the expected answer if the video contains no supporting evidence.

## Study mode cannot start

`completed` means a video is ready for search, independently of PLOG completion. Check the PLOG status, concepts, and relationships on the video detail screen. Empty graphs or graphs that cannot produce a learning order need editing or regeneration. See [PLOG and study mode](../plog/README.md).

## A corrected transcript still gives old answers or hints

Saving subtitles and completing their asynchronous search reindex are separate events. The video's existing `completed` label does not confirm an edit's reindex finished. Check the matching worker job, then send a new Q&A question; previously displayed or saved answers stay unchanged.

Study support reads nearby text directly from the saved transcript and can use a correction before search reindexing finishes. Its stored questions and hints do not update when subtitles are saved or search is reindexed. Review and edit the affected learning data, or explicitly rebuild PLOG after preserving any manual work you need. A rebuild replaces those edits and does not migrate ongoing progress to the new concept IDs. Follow the [update scope table and correction walkthrough](../architecture/transcription-and-search.md#update-scope) before choosing an operation.

Check the corrected opening questions and hints in a [fresh Study session](../plog/README.md#verify-in-fresh-session). Switching Q&A → Study only clears visible messages; existing progress can cause a check to skip the opening question or grade the new message as a reply to an earlier question.

## Study progress changed after returning

A cleared conversation does not reset temporary progress. Reloading, copied tabs, the 12-hour expiry, and starting over have different effects. See [Resuming study and starting over](../plog/study-sessions.md).

## Configuration changes have no effect

Changes to Compose's `.env` do not automatically reach running processes:

```bash
docker compose up -d --force-recreate api worker
```

The variables forwarded to the API are limited by [docker-dev.sh](https://github.com/yukiharada1228/videoq/blob/main/apps/api/scripts/docker-dev.sh). Adding an arbitrary variable to `.env` may not make it available to the API.

## Ask the team for help

Share the operation you tried, screen URL, video ID, expected result, actual state, and relevant log timestamps or request IDs. Remove keys, cookies, and users' private data from logs before sharing them.
