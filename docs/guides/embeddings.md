---
title: Configure and verify embeddings
description: The fixed 1536-dimensional contract, provider settings, diagnostics, and model-change limitations.
---

# Configure and verify embeddings

VideoQ stores scene embeddings in `scene_embeddings.embedding vector(1536)`. The API and Python worker use a fixed `EMBEDDING_DIMENSIONS = 1536` constant. `EMBEDDING_VECTOR_SIZE` has been removed: a leftover variable is ignored, regardless of its value. No database migration is needed for this change.

## Choose a provider for a new environment

The templates, Compose, and Wrangler default to:

```dotenv
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
```

Set `OPENAI_API_KEY` in the relevant environment. Both query and document requests send `dimensions: 1536`. Other models must accept that parameter and produce 1536-dimensional vectors; the application never retries without it.

Provider names are trimmed and lowercased. Empty provider values select OpenAI; an empty model selects `text-embedding-3-small` for OpenAI. Model names are trimmed but retain their case. An unknown provider or a missing Ollama model is a configuration error.

Wrangler keeps `EMBEDDING_MODEL` empty in both development and production so the adapter resolves this default. Overriding only the provider to Ollama therefore fails validation instead of inheriting an OpenAI model name.

For a **new, disposable development database**, Ollama is another option:

```bash
ollama pull qwen3-embedding:4b
```

```dotenv
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=qwen3-embedding:4b
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

When using Docker Compose with Ollama running on the host, set both `OLLAMA_BASE_URL` and `WORKER_OLLAMA_BASE_URL` to `http://host.docker.internal:11434`. Configure the same provider and model for the API and worker. Ollama replaces embedding generation only; transcription and answer generation have their own settings and may still require OpenAI credentials.

Both adapters call `POST /api/embed` with `model`, `input`, and `dimensions: 1536`, and read the `embeddings` array. This requests the model's supported reduced representation. The app does not truncate or pad vectors and does not fall back to the old `/api/embeddings` endpoint.

`qwen3-embedding:4b` has a native size of 2560 and supports dimension reduction. The 1024-dimensional `qwen3-embedding:0.6b` is unsuitable for this contract. The 4096-dimensional `8b` model is a candidate requiring separate validation. See the [Qwen model table](https://github.com/QwenLM/Qwen3-Embedding#qwen3-embedding-series-model-list) and [Ollama embed API](https://docs.ollama.com/api/embed). The 4b setup was tested with Ollama 0.34.2; validate the actual output when updating your server or model.

## What gets checked

Before scene search, indexing, PLOG concept embedding, or Study grading, the relevant path verifies the declared DB column is `vector(1536)`, including when the table is empty. A missing column, another type, or an unbounded `vector` column fails validation.

Every generated vector must contain exactly 1536 finite numeric values, fit pgvector's float32 representation, and remain nonzero. Strings and booleans are rejected. Batch counts and OpenAI response indices must match the inputs. Study also validates stored nonempty PLOG vectors; an ungenerated empty vector retains its existing not-ready meaning. Invalid data is not treated as zero similarity or an incorrect learner answer.

Scene splitting and RAGAS share output validation without requiring a DB for standalone calculations. Contract errors propagate instead of silently producing fallback scenes or missing scores. Pure data deletion requires no model call or credentials. Full reindexing checks the configuration, DB, and a short real embedding **before deleting existing vectors**; failures later in the job still do not provide atomic rollback.

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
| `EMBEDDING_CONFIG_INVALID` | Unsupported provider, missing required model, or a worker embedding request rejected with HTTP 4xx (except 408/429) |
| `EMBEDDING_SCHEMA_MISMATCH` | DB declaration differs from `vector(1536)` |
| `EMBEDDING_OUTPUT_INVALID` | Invalid model output, count, or indices |
| `EMBEDDING_DATA_INVALID` | Invalid stored PLOG vector |

Q&A and Study keep their existing public errors: configuration/schema errors use HTTP 400 `VALIDATION_ERROR` or SSE `LLM_CONFIGURATION_ERROR`; output/stored-data errors use HTTP 500 `INTERNAL_ERROR` or SSE `LLM_PROVIDER_ERROR`. Failed answers release reserved quota and do not commit Study progress. Worker jobs use the existing failure/retry handling.

The worker propagates permanent provider rejections, including unsupported models or dimensions, through scene splitting and RAGAS; evaluations are recorded as failed. It does not log the provider's response body. Timeouts, rate limits, and server failures retain the existing best-effort fallback in those two paths.

## Existing data and future model changes

**Equal dimensions do not make different models compatible.** Saved embeddings do not record their generating model or revision. The DB check cannot detect an API/worker model disagreement, an old model's data, or a changed model behind the same tag. Compare diagnostics and keep operational records of the generating configuration.

This change provides no existing-data model migration tool. Changing models requires regenerating both scene and PLOG concept embeddings, even at 1536 dimensions. The current full reindex only addresses scenes; rebuilding PLOG can replace concept IDs, edited teaching material, and learning history. Neither operation is a complete model migration procedure.

A future migration must include all of the following:

1. Verify the target model and dimensions without altering source data; determine the old generating configuration from records.
2. For different dimensions, change the application contract and Drizzle schema and generate a new migration to a fixed `vector(N)`. Do not rewrite historical SQL/snapshots or run automatic startup DDL.
3. Reserve maintenance time and stop Q&A, Study, worker writes, API PLOG edits, in-flight work, and old queued jobs.
4. Back up transcripts, concepts, edited materials, vectors, schema, application version, and configuration. `ALTER TYPE` alone cannot preserve incompatible old vectors.
5. Regenerate scene and concept vectors together while preserving PLOG IDs, labels, relationships, questions, hints, and learning history.
6. Verify counts, missing data, dimensions, Q&A retrieval, and Study selection before resuming with matching API/worker settings. On failure, maintain downtime and restore the complete old data/schema/application/configuration set.

Until preservation and recovery tooling exists, changing an existing database's model or dimensions is not a supported routine operation. Recreating a disposable development database is a separate choice.
