---
title: Configure and verify embeddings
description: The fixed 1536-dimensional contract, provider settings, diagnostics, and model-change limitations.
---

# Configure and verify embeddings

VideoQ stores scene embeddings in `scene_embeddings.embedding vector(1536)`. The API and Python worker use a fixed `EMBEDDING_DIMENSIONS = 1536` constant. `EMBEDDING_VECTOR_SIZE` has been removed: a leftover variable is ignored, regardless of its value. No database migration is needed for this change.

## Choose a hosted or private endpoint

VideoQ uses the OpenAI-compatible embeddings protocol. Templates, Compose and
Wrangler default to:

```dotenv
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
```

Set `OPENAI_API_KEY` in the environment. A private llama.cpp or vLLM service uses
the same protocol, its own model alias and an explicit endpoint, for example:

```dotenv
EMBEDDING_PROVIDER=openai
EMBEDDING_BASE_URL=http://embedding.intranet:8000/v1
EMBEDDING_API_KEY=local-inference
EMBEDDING_MODEL=gte-qwen2-1.5b-q4km-124fbdad
```

`EMBEDDING_API_KEY` falls back to `OPENAI_API_KEY`; use a placeholder only when
the private server has no authentication. `EMBEDDING_BASE_URL` falls back to
`OPENAI_BASE_URL` when empty, so set it explicitly for a separate embedding
service. The API and worker must use the same model/endpoint. With Compose and a
host-side server, use `http://host.docker.internal:8001/v1` if that server listens
on port 8001. Chat and Whisper have independent settings; see [local AI inference](local-inference.md).

Requests use `POST /v1/embeddings` with `dimensions: 1536`, `encoding_format: float`,
model and input. The llama.cpp profile uses native 1536-dimensional gte-Qwen2;
vLLM uses Qwen3-Embedding-4B with reduced output explicitly enabled. The
application rejects incompatible output without truncating, padding, retrying
without dimensions or choosing a hosted fallback.

Provider names are trimmed and lowercased. Empty or `openai` selects this
protocol; any other value, including the removed `ollama`, is a configuration
error before network access. Empty models default to `text-embedding-3-small`;
private installations must set their actual served alias. Remove obsolete
`OLLAMA_BASE_URL` / `WORKER_OLLAMA_BASE_URL` variables. Existing vectors require
regeneration when changing models, even at the same dimensions; follow the
maintenance and recovery constraints below.

For attribution, see [OpenAI embeddings](../reference/ai-references.md#openai-embeddings)
and [Qwen3 Embedding](../reference/ai-references.md#qwen3-embedding) when that family
is used. Record the actual weight revision, quantization and serving image.

## What gets checked

Before scene search or indexing, the relevant path verifies the declared DB column is `vector(1536)`, including when the table is empty. A missing column, another type, or an unbounded `vector` column fails validation.

Every generated vector must contain exactly 1536 finite numeric values, fit pgvector's float32 representation, and remain nonzero. Strings and booleans are rejected. Batch counts and OpenAI response indices must match the inputs.

Scene splitting uses output validation without requiring a DB for standalone calculations. Contract errors propagate instead of silently producing fallback scenes. Pure data deletion requires no model call or credentials.

Full reindexing checks the DB embedding contract when there are eligible videos, then generates and validates **all replacement embeddings for one video before changing that video's rows**. It locks the current video row, rechecks the transcript, and replaces the rows in a single transaction. A failed video retains its old index while other videos can finish; the job reports failure for retry if any video failed. There is no initial deletion of the entire index and no separate short probe in this job. Use the explicit `--probe` diagnostics below when needed. The operation is atomic per video, not across the full collection.

## Compare API and worker diagnostics

Use the effective provider/model settings for each runtime and a `DATABASE_URL` pointing to its database. The commands below run from the API and worker directories respectively. The API command can load a dotenv file through `DOTENV_CONFIG_PATH`; the Python command reads exported environment variables.

```bash
# apps/api: settings and declared DB type only
npm run embeddings:check
# apps/worker: use your installed worker environment
python -m worker_python.check_embeddings
```

To additionally call the configured model with a short diagnostic input, explicitly opt in (external API charges may apply):

```bash
# apps/api
npm run embeddings:check -- --probe
# apps/worker
python -m worker_python.check_embeddings --probe
```

Successful DB validation emits JSON such as:

```json
{"event":"embedding.validation","provider":"openai","model":"text-embedding-3-small","expected_dimensions":1536,"db_dimensions":1536}
```

The probe additionally reports `actual_dimensions`. Compare `provider`, `model`, and dimension fields across both runtimes. Logs omit credentials, connection strings, input text, and vectors. Startup and health checks do not generate paid embeddings.

| Internal reason | Meaning |
|---|---|
| `EMBEDDING_CONFIG_INVALID` | Unsupported provider or a worker embedding request rejected with HTTP 4xx (except 408/429) |
| `EMBEDDING_SCHEMA_MISMATCH` | DB declaration differs from `vector(1536)` |
| `EMBEDDING_OUTPUT_INVALID` | Invalid model output, count, or indices |

Q&A keeps its existing public errors: configuration/schema errors use HTTP 400 `VALIDATION_ERROR` or SSE `LLM_CONFIGURATION_ERROR`; output errors use HTTP 500 `INTERNAL_ERROR` or SSE `LLM_PROVIDER_ERROR`. Failed answers release reserved quota. Worker jobs use the existing failure/retry handling.

The worker propagates permanent provider rejections, including unsupported models or dimensions, through scene splitting. It does not log the provider's response body. Timeouts, rate limits, and server failures retain the existing best-effort fallback in scene splitting.

## Existing data and future model changes

**Equal dimensions do not make different models compatible.** Saved embeddings do not record their generating model or revision. The DB check cannot detect an API/worker model disagreement, an old model's data, or a changed model behind the same tag. Compare diagnostics and keep operational records of the generating configuration.

No existing-data model migration tool is provided. Changing models requires regenerating scene embeddings, even at 1536 dimensions. Full reindexing updates scenes, but a migration procedure must also account for recovery after partial failures.

A future migration must include all of the following:

1. Verify the target model and dimensions without altering source data; determine the old generating configuration from records.
2. For different dimensions, change the application contract and Drizzle schema and generate a new migration to a fixed `vector(N)`. Do not rewrite historical SQL/snapshots or run automatic startup DDL.
3. Reserve maintenance time and stop Q&A and worker writes, in-flight work, and old queued jobs.
4. Back up transcripts, vectors, schema, application version, and configuration. `ALTER TYPE` alone cannot preserve incompatible old vectors.
5. Regenerate scene vectors with the same configuration while preserving transcripts.
6. Verify counts, missing data, dimensions, and Q&A retrieval before resuming with matching API/worker settings. On failure, maintain downtime and restore the complete old data/schema/application/configuration set.

Until preservation and recovery tooling exists, changing an existing database's model or dimensions is not a supported routine operation. Recreating a disposable development database is a separate choice.
