# Cloud transcription: OpenAI whisper-1

**Historical release runbook (PR #1146).** The Groq migration is documented in [the current provider runbook](groq-inference.md); this page describes the preceding OpenAI-only release and its rollback context.

That release used OpenAI's hosted `/v1/audio/transcriptions` endpoint with
`model=whisper-1`. On-premises inference uses the separate `local` configuration.
There is no Modal backend or automatic provider fallback.

The pre-Modal catalog at `5b3ed5b4^` defined monthly transcription allowances of
Free **45**, Basic **200**, and Pro **1,000** minutes. Migration
`0040_restore_openai_transcription_allowances` restores these values for eligible
plan-managed accounts. Administrator overrides, recorded usage, subscription
prices, storage, upload and AI-answer entitlements are preserved. Usage above
the restored limit prevents further reservations until the normal UTC monthly
reset; it does not delete videos or erase usage.

The planning script uses OpenAI's published **$0.006/audio minute** rate. Its
other costs remain explicit assumptions, not measured production invoices.

## Release order

1. Verify the production OpenAI key with a short, non-sensitive audio fixture.
   Require `verbose_json` with real segment timestamps. Never log credentials,
   request audio or transcript content.
2. Check `video_transcription_runs` for incomplete plans with
   `chunk_seconds <> 300`. Finish them on the previous release before upgrading.
   Also check queue in-flight messages and the worker's active invocations.
   Do not delete plans, usage reservations, saved transcripts or queued jobs.
3. Set `WHISPER_BACKEND=openai` in `/videoq/prod/app`, preserving unrelated JSON
   keys. Remove `WHISPER_MODAL_URL` and `WHISPER_MODAL_TOKEN`.
4. Apply the normal forward database migrations and deploy the matching API,
   web and Lambda release through CD. The API's free signup default must be 45.
   SSM is cached for a warm Lambda container: a new worker version/configuration
   is required to ensure all new invocations read the new parameter value.
5. Verify a complete new upload, transcription timestamps, indexing and Q&A.
   Verify the public plan API, both languages' pricing and legal pages, and
   unchanged usage counters. Require new transcription plans to use 300 seconds.
6. After the worker has switched and no Modal requests remain, stop only the
   retired `videoq-batched-whisper` Modal application and remove its VideoQ
   deployment credentials from GitHub's `production-app` environment. Other
   applications and account-wide credentials are outside this retirement.

The dated Modal benchmark reports are historical evidence. They are not current
deployment recipes. Audio/transcripts already processed by the former provider
may remain subject to its published retention period after the switch.

## Provider data controls and service deadline

OpenAI states that API data is not used for training unless explicitly shared.
Its endpoint table lists **no abuse-monitoring or application-state retention**
for `/v1/audio/transcriptions`. Other API endpoints have different controls;
do not apply a blanket "30 days" statement to speech transcription or promise
that deleting a VideoQ record immediately deletes all provider records.

As checked on **2026-10-23**, hosted `whisper-1` is deprecated and scheduled to
shut down on **2027-02-26**. This change preserves the explicitly requested
model; schedule a separate migration before that deadline, including subtitle
timestamp compatibility tests. It does not apply to locally hosted open-weight
Whisper checkpoints.

Sources: [Whisper pricing](https://developers.openai.com/api/docs/models/whisper-1),
[data controls](https://developers.openai.com/api/docs/guides/your-data),
[transcription deprecation](https://developers.openai.com/api/docs/deprecations#2026-08-26-transcription-models).
