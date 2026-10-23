# Groq migration validation — 2026-10-24

Implementation and public-fixture measurements, collected October 23–24 in
Japan. This is a draft release; production has not been changed by this work.
Configuration, deployment and rollback: [provider runbook](groq-inference.md).

## Changes and decisions

| Area | Files and behavior |
|---|---|
| Chat boundary | `apps/api/src/lib/inference-provider.ts`, `chat-transport.ts`, `chat-model.ts`: validated Groq/OpenAI/local routes, fixed hosted URLs, bounded availability retries, isolated credentials, no stream replay |
| Compatibility | Original prompts and RAG retrieval remain; adapter separates tool decisions from terminal output. A private `json` stop tool absorbs GPT-OSS's terminal tool convention; its draft arguments are discarded. Streaming JSON is parsed incrementally and validated against the existing schema and citation contract |
| Vision and embeddings | `visual-inspection.ts`: independent OpenAI image model; local URLs fail closed. Embedding implementation/model/dimensions and stored vectors unchanged |
| Metrics | `answer-cost-ledger.ts`, `inference-cost.ts`, chat `message-service.ts`, answer-cost SQL: actual provider/model usage, reasoning/cache counts, TTFT/completion, dated estimates; missing costs remain unknown |
| Speech | worker `pipeline/transcription_provider.py`, `transcription.py`, `transcription_stitching.py`, `speech_metrics.py`: bounded speech fallback, real timestamps, upload cap, one-second Groq context and seam join, content-free metrics |
| Durable state | `transcription_checkpoints.py`: joins contextual windows only when saved timestamps cross core intervals; local/OpenAI assembly behavior, IDs, quota reservations, fencing and transactions preserved |
| Configuration | Wrangler/generated bindings, Node configuration, development templates/startup script, SSM bootstrap and Terraform placeholders; no dependency added |
| Documentation | Root/API/worker READMEs, infrastructure deployment guide, local inference/prompt guides, provider runbook; Japanese/English provider/privacy notice |
| Evaluation | `groq-comparison.live.test.ts`, `compare_speech_providers.py`, Groq/cost/seam unit tests; existing compatible-endpoint fixtures explicitly select local/OpenAI |

The requested fallback IDs remain `gpt-4o-mini` and `whisper-1`. The preceding
repository chat default was `gpt-6-luna`, so it is measured separately. No
Cross-Encoder was found in the existing vector ranking path. No re-embedding,
quota migration, frontend/SSE schema change or production data mutation occurs.
On-premises CPU remains llama.cpp + whisper.cpp; NVIDIA remains vLLM.

## Functional verification

- API unit/integration: **1,706 passed, 40 skipped** with an isolated local
  PostgreSQL/pgvector instance; skips are opt-in external/hardware scenarios.
- Workers isolate: **32 passed**. Frontend: **1,298 passed**.
- Worker: **594 passed, one opt-in skip**, including minimum-billing and
  content-free speech metric checks.
- TypeScript typecheck, generated binding check, Node build, Helm application
  and inference chart lint passed. Deployment policy: **164 Node tests** and
  **38 Python tests** passed. English/Japanese documentation build passed.
- Paid Groq-only production RAG stream: Japanese cited explanation, English
  code answer and no-course guidance passed; exact citation IDs/timestamps,
  final schema, displayed stream text and expected fixture facts checked.
  Rate-aware spacing was used, so these are functional results, not latency
  benchmarks. A follow-up Japanese stream verified single JSON encoding of
  paragraph newlines/TeX after a formatting issue was found and corrected.
- Groq nonstreaming native strict JSON Schema also passed with the real API.
  Explicit OpenAI and Groq-to-OpenAI fallback worked with real APIs. HTTP 429
  fallback was observed under the key's actual quota; timeout/temporary 5xx,
  auth/TLS rejection, caller cancellation, early stream failure and no replay
  after partial output were exercised with deterministic offline tests.
- Paid OpenAI embedding → worker indexing → pgvector → cited Q&A passed in a
  disposable local DB; vectors remained **1,536 dimensions**. The DB was
  dropped afterward. No production records were used.
- The new worker speech adapter transcribed the public 10.44-second Japanese
  fixture through the existing CPU whisper.cpp gateway in **15.00 seconds**,
  with both hosted keys absent and an HTTP guard allowing only the local
  endpoint. Only `/v1/audio/transcriptions` was called. Temporary containers
  and network were removed. This run used a loopback-published Docker bridge;
  the prior offline-container acceptance remains a separate test.

## Measured speech comparison

Same 12 distinct public FLEURS Japanese clips, **136.02 seconds** total, using
the production extraction/adapter path. One pass per configuration. CER is
NFKC normalized, ignoring punctuation/space, and averaged across clips.

| Provider, concurrency | Total wall time | Median seconds / audio minute | Mean CER | Actual route |
|---|---:|---:|---:|---|
| Groq, 1 | 5.90 s | 2.32 | 5.17% | 12/12 Groq |
| OpenAI, 1 | 19.93 s | 9.35 | 6.96% | 12/12 OpenAI |
| Groq requested, 4 | 4.40 s | mixed | mixed | 9 Groq, 3 OpenAI fallbacks |
| OpenAI, 4 | 5.77 s | 8.49 | 6.96% | 12/12 OpenAI |

Published audio rates are Groq **$0.04/hour** (10-second minimum per request)
and OpenAI **$0.36/hour**. The serial fixture's estimated Groq charge is
**$0.001567**, or **$0.04148 per source audio hour**, versus OpenAI
**$0.013602**. The mixed run includes failed attempts with unknown charges,
so its total cost is unknown. Overlap, retries, minimum billing and separate
embedding/vision costs must be included in production planning.

An additional 87.06-second fixture with six speech regions and pauses was
split into 30-second core intervals. All six regions had captions and all
timestamps were finite, ordered and in source bounds. Overall CER was
**12.55% Groq / 9.59% OpenAI**: quality did not improve on this fixture.
Coarse cue timing affected both providers; exact matched-cue timing error was
available for only one Groq and one OpenAI cue (Groq start/end 1.56/0.60 s;
OpenAI 3.56/2.66 s). This does not establish word-level timing accuracy.
Neither model passed a separate pure-silence quality check: Groq produced
eight normalized characters and OpenAI three. These findings require
quality review before a production rollout; they are not hidden by the
short-clip average. Japanese WER is unreported without a specified tokenizer.

## Measured LLM comparison

Three fixed synthetic public-evidence scenarios, two repeats per model,
using the production RAG streaming path. All 18 runs passed final schema,
expected facts, citation ID/timestamp and stream/final-content checks.

| Requested model | Median visible TTFT | Median completion | Full requested-provider runs |
|---|---:|---:|---:|
| Groq GPT-OSS 120B | 4.483 s | 5.460 s | 0/6; quota-triggered OpenAI fallback |
| OpenAI GPT-4o-mini | 1.798 s | 2.761 s | 6/6 |
| OpenAI GPT-6 Luna | 2.974 s | 3.493 s | 6/6 |

These results **do not demonstrate faster LLM responses**. This key reported
8,000 tokens/minute, while consecutive full RAG tool rounds exceed that
budget. The three separately paced Groq-only functional runs passed but
include deliberate waits and cannot replace a production speed comparison.
Input/output/reasoning token counters and per-call timings are retained in
the private reports. GPT-4o-mini's median estimated completed-answer model
charge was $0.000803. Failed Groq attempts have unknown cost; no complete
mixed-answer cost reduction is claimed. GPT-6 Luna pricing is deliberately
unregistered in this estimate, and is reported as unknown rather than zero.

## Limits and review before release

Adequate Groq project quota and a larger representative Japanese quality
suite are needed before deployment approval. New NVIDIA hardware validation,
production-scale concurrency, production traffic, browser-level live model
rendering and a deployed full upload smoke are unverified in this change.
Existing on-premises engine/container recipes remain unchanged. Hosted
fallbacks' published retirement dates are recorded in the runbook.

Raw opt-in reports are private local files under `/tmp/videoq-groq-`:
`llm-comparison-final.json`, `llm-primary-final.json`, `llm-format.json`,
`speech-comparison.json`, `speech-seams.json`, and `local-cpu.json`.
They contain only the named public/synthetic fixtures. The Groq credential
is held only in ignored local `.dev.vars`; replace the chat-shared validation
key before production use. No production secrets were updated.
