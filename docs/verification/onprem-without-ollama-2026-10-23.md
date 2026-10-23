# Current local inference contract — 2026-10-23

This change retires the dedicated Ollama support and follows the user's decision
that backward compatibility is unnecessary. Current setup uses llama.cpp on CPU
or the vLLM NVIDIA recipe, plus the independent private faster-whisper service.
It is stacked on the on-prem application edition in PR #1144.

## Current configuration

Embeddings always use the OpenAI-compatible protocol. Configure the model,
endpoint and optional separate key with `EMBEDDING_MODEL`, `EMBEDDING_BASE_URL`
and `EMBEDDING_API_KEY`. Shared chat/embedding services may use `OPENAI_BASE_URL`
and `OPENAI_API_KEY` for both. There is no provider selector, adapter branch or
backward-compatibility alias. API, worker, Node, Workers, Compose, Terraform,
Helm and the current English/Japanese guides use this same configuration.

Helm validates the current application AI keys and inference settings through
strict schemas, rather than special cases for retired options. Unknown fixed
fields are rejected, while Kubernetes resource and node-selector maps keep their
variable keys. llama.cpp remains the inference-chart default; vLLM and the
optional Whisper CUDA overlay remain available. Model revisions/digests,
read-only offline serving and private network policy remain enforced.

Current installation instructions focus on initializing a new deployment. The
Kubernetes lab creates its administrator through the provisioning command and
does not run a second promotion command. No migration bridge or retired-provider
validation cases are included. Historical reports remain marked as historical.

The 1536-dimensional storage/output contract, finite/nonzero vector validation,
per-video atomic reindexing and API/worker model consistency are current
correctness requirements. Choosing a different model during later operation
requires rebuilding vectors before resuming Q&A; matching dimensions alone do
not establish a shared vector space.

## Verification

- API with PostgreSQL, cross-language checks and Helm: 1679 passed, 38 independently
  gated tests skipped. API typecheck, Node production bundle and generated Worker
  binding checks passed. Native Workers: 32 passed.
- Worker: 458 passed, 105 independently gated tests skipped. Workflow policy:
  168 passed; on-prem release/registry policy: 10 passed; Terraform format passed.
- Current CPU, vLLM and Whisper CUDA settings render successfully and reject
  unknown configuration fields. English/Japanese documentation production builds
  and public-content checks passed.
- After removing the selector, two real llama.cpp embedding tests passed in
  6.17 seconds: the 1536-dimensional query output and TypeScript/Python embedding
  agreement. GPU layers were disabled and reviewed local GGUF weights were used.
  The temporary server and DB were removed afterward.
- The earlier six real CPU-model tests passed in 260.12 seconds for structured
  answers, SSE, tools, query vectors, cross-language agreement and streaming RAG
  with fixed retrieval evidence. Chat inference code is unchanged by the
  subsequent configuration simplification.

Local logs: `/tmp/videoq-current-config-validation`; the earlier full CPU-model
logs remain at `/tmp/videoq-remove-ollama-validation`. Final-head CI and Kubernetes
lifecycle evidence are linked from the pull request. Lifecycle inference uses
private deterministic fixtures; model-quality and GPU-hardware acceptance remain
site-specific. This change does not merge PRs or publish/deploy release images.
