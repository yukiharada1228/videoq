# SaaS inference providers

The SaaS configuration uses Groq chat and speech, with OpenAI fallback. The
on-premises CPU profile remains llama.cpp + whisper.cpp; NVIDIA remains vLLM
for chat, embeddings and speech. No hosted key is required by those profiles.

## Configuration

| Setting | SaaS default | Explicit OpenAI | On-premises |
|---|---|---|---|
| `LLM_PROVIDER` | `groq` | `openai` | `local` |
| `LLM_MODEL` | `openai/gpt-oss-120b` | `gpt-4o-mini` | served private alias |
| `TRANSCRIPTION_PROVIDER` | `groq` | `openai` | `local` |
| `TRANSCRIPTION_MODEL` | `whisper-large-v3-turbo` | `whisper-1` | `whisper-local` |
| `VISUAL_MODEL` | OpenAI `gpt-6-luna` | OpenAI `gpt-6-luna` | private vision model, or disable visual Q&A |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | unchanged | existing private alias |

SaaS requires `GROQ_API_KEY` and `OPENAI_API_KEY`. Store them in ignored
`apps/api/.dev.vars` (mode 0600) for development; in Worker secrets and the
existing SSM `/videoq/prod/app` SecureString JSON for production. Never put
keys in Git, screenshots, issue comments or command arguments. The worker
loads canonical transcription settings from SSM once per warm container.
`TRANSCRIPTION_PROVIDER` takes precedence over legacy `WHISPER_BACKEND`;
without either, SaaS defaults to Groq and `DEPLOYMENT_EDITION=onprem` to local.
When switching providers, change the model at the same time or unset it.

Hosted URLs are fixed at `https://api.groq.com/openai/v1` and
`https://api.openai.com/v1`; `OPENAI_BASE_URL` only routes local chat and the
existing compatible embedding configuration. Do not set it to Groq to select
chat: that would also redirect embeddings. Local speech uses
`WHISPER_LOCAL_URL`, with `/v1` for the Kubernetes gateway and without `/v1`
for the documented native Mac whisper.cpp launch command. Keep the existing
Helm values, private URLs, embedding model and 1536 dimensions unchanged.
No database or vector migration is introduced by this change.

The pre-migration repository defaults to `gpt-6-luna`, despite the request's
GPT-4o-mini baseline. Both explicit OpenAI models remain selectable for
comparison. The actual retrieval path uses PGVectorStore similarity ranking;
no Cross-Encoder implementation was found or changed.

## Request behavior and limits

The adapter preserves the original system prompts, RAG evidence, citation
validation, incremental answer parser and final API/SSE schemas. GPT-OSS is
text-only, so image inspection stays on OpenAI. Reasoning defaults to `low`
(`low`, `medium`, `high` accepted), with reasoning text excluded from answers.
Groq does not combine strict structured output with tools or streaming:
tool decisions run without the final schema; a provider formatting instruction limits function names to the supplied tools. GPT-OSS may represent completion as a `json` function call; the adapter registers that private stop signal and discards its arguments, then generates the terminal answer from the original evidence. Draft prose is also discarded.
Terminal nonstreaming answers use native strict JSON Schema. Streaming uses
JSON mode plus the same schema validation and citation filtering as before.
An invalid or truncated answer remains an error, without a repair request.

Groq chat gets two attempts, then one GPT-4o-mini attempt. Each hosted attempt
has a 30-second deadline, within the existing overall request deadline. Only
temporary 408/429/5xx and connection/timeouts qualify. Backoff is bounded,
exponential and jittered. Auth, model, request, TLS and caller cancellation
errors fail without fallback. Once any model frame is emitted, there is no
provider replay. A successful fallback remains selected for that answer's
later tool rounds. Local chat has no hosted fallback.

Speech gets two 35-second Groq attempts then one 35-second OpenAI attempt;
explicit OpenAI gets two attempts. Local speech retains 120-second timeout
and two SDK retries, with no hosted route. Multipart uploads must be nonempty
and at most 24,000,000 bytes, below Groq's 25 MB attachment limit. Production
uses the same durable 30–300-second intervals and 64 kbps mono MP3 extraction.
Groq adds one second of context on each side and applies the source offset
once. Only overlapping text at adjacent seams is joined; unrelated and
non-overlapping repeated speech is retained. Timestamp decoding requires
real finite segment start/end values; no synthetic word timings are created.
SRT/TXT, reservations, stable job IDs, fences, queue handoff and checkpoint
transactions retain their existing contracts. Normal ASR recognition errors
and differently worded seam repetitions still need quality monitoring.

## Metrics and opt-in evaluation

`llm_provider_call` logs provider, status, HTTP status, duration, TTFT and an
estimated cost, without keys, prompts, answers or upstream error bodies.
The existing answer ledger stores numeric usage (including reasoning and
cached tokens) plus the actual provider/model/attempt, timing and estimated
cost. `answer_latency` measures first visible text and completion across the
whole RAG request. `speech_provider_call` records actual provider/model,
duration and audio duration. A failure with missing usage has unknown cost,
never zero. Token estimates include reasoning in completion tokens once.
Rates are dated estimates, not invoices; image and embedding charges are
separate. See the existing answer-cost SQL for per-provider aggregation.

Paid evaluation is disabled in ordinary CI:

```sh
GROQ_COMPARISON_LIVE=1 GROQ_COMPARISON_REPORT=/tmp/llm-comparison.json \
  npm run test:unit --workspace @videoq/api -- test/groq-comparison.live.test.ts
python apps/worker/scripts/compare_speech_providers.py \
  --suite /path/to/public-fixtures/suite.json --vars apps/api/.dev.vars \
  --report /tmp/speech-comparison.json --concurrency 1,4
```

The LLM runner reuses the production RAG stream with fixed synthetic course
evidence; records per-call input/output/reasoning tokens, TTFT, completion,
cost, expected facts, citation IDs and exact source timestamps. No production
DB, queues or user content are accessed. `GROQ_COMPARISON_MODELS` and
`GROQ_COMPARISON_REPEATS` control the comparison. For low quotas, use
`GROQ_COMPARISON_PACE_MS=50000`, `GROQ_COMPARISON_REQUIRE_PRIMARY=1`,
`GROQ_COMPARISON_MODELS=openai/gpt-oss-120b`; paced results verify function
and **cannot** support speed claims. This validation key reported an 8,000
token/minute limit, below the needs of consecutive full RAG tool rounds.
Check project quotas before production rollout; upgrading quota is an
account-level operation, not a code change.

The speech suite format is `{source, source_url, cases:[{name,file,duration,
reference,regions:[{start,end,reference}]}]}`. Supply only public or explicitly
approved audio. `--interval 30` exercises seams. It records normalized CER,
optional whitespace WER, timestamp validity and matched cue errors, seam
coverage, throughput and actual-provider cost. Japanese WER needs a specified
morphological tokenizer; cue spans are not word-level ground truth. A fixture
region that cannot be matched has unknown timing error. Concurrent results
with fallback are mixed-provider measurements. Never label them Groq-only.
Reports use exclusive 0600 creation and contain only the specified fixtures.

## Release and rollback

1. Review the matching API/web/worker release and require CI to pass. Verify
   public-fixture Groq/OpenAI/local tests and adequate project quotas. Keep
   the current production release while preparing credentials and settings.
2. Add `GROQ_API_KEY` to production Worker secrets and merge it into SSM app
   JSON without replacing other values. Add canonical transcription provider
   and model together. Keep the OpenAI key. Terraform ignores later secret
   value changes; its placeholder values are not deployment credentials.
3. Observe in-flight SQS jobs and saved plans; preserve all messages,
   reservations and checkpoints. Deploy the matching Worker, web and Lambda
   through normal CD. A new Lambda version/configuration refreshes warm SSM
   state. There is no quota migration: Free/Basic/Pro remain 45/200/1000 minutes.
4. Verify a new upload through ASR, SRT/TXT, 1536-dimensional indexing and cited
   streaming Q&A. Monitor provider 429s, fallback rate, latency, failed chunks,
   reservations, and costs; check the Japanese/English data-handling notice.
5. Roll back by setting chat to `LLM_PROVIDER=openai`, `LLM_MODEL=gpt-4o-mini`
   and speech to `TRANSCRIPTION_PROVIDER=openai`,
   `TRANSCRIPTION_MODEL=whisper-1`, then deploy/refresh Lambda. Never delete
   jobs or usage to roll back. Existing saved chunks remain resumable.

The specified fallback models have published retirement dates: GPT-4o-mini
2027-01-14 and Whisper-1 2027-02-26. Select and validate successors before
those dates; this migration does not silently substitute different models.

## Provider data handling and references

Groq receives questions and selected course/caption evidence for answers and
extracted audio for speech. OpenAI receives fallback requests, embeddings and
selected still images for inspection. Whole videos, account email addresses
and entire chat histories are not part of these inference requests. Groq
states that inference input/output is not retained by default, with possible
temporary retention for reliability/abuse (up to 30 days). Zero Data Retention
is an account setting; this code does not establish that it is enabled.

- [Groq GPT-OSS 120B and pricing](https://console.groq.com/docs/model/openai/gpt-oss-120b)
- [Reasoning parameters](https://console.groq.com/docs/reasoning)
- [Structured-output limitations](https://console.groq.com/docs/structured-outputs)
- [Speech formats, upload limits and pricing](https://console.groq.com/docs/speech-to-text)
- [Groq data handling](https://console.groq.com/docs/your-data)
- [OpenAI data handling](https://developers.openai.com/api/docs/guides/your-data)
- [OpenAI retirement dates](https://developers.openai.com/api/docs/deprecations)

API specifications and prices checked 2026-10-23. See the dated validation
report for measured results and their limitations.
