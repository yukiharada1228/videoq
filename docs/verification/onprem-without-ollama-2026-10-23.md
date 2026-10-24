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

Whisper uses the current `openai`, `modal` or `local` backend names. The local
API has one configuration name rather than a second engine-named alias. Mac
development runs native whisper.cpp with Metal; the shared Kubernetes service
uses faster-whisper on CPU or NVIDIA GPU. Both use `local` and the same worker.
The documented whisper.cpp command enables MP3 conversion and preserves segment
timestamps. Its base URL omits `/v1`; the faster-whisper base includes `/v1`.

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

- Mac speech acceptance: native whisper.cpp 1.9.5 with Apple M4 Metal and a local
  `large-v3-turbo` GGML model passed the opt-in production-worker test (3.54 s).
  The model SHA256 was
  `1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69`.
  The same test passed against the private faster-whisper CPU/int8 container
  using the cached base model (2.87 s). Both checks used a nonsensitive 17.3-second
  English video, extracted a 12-second MP3 interval at offset 2 seconds, inspected
  real HTTP segment timestamps and verified source-relative SRT output. A
  text-only fallback cannot satisfy the test. These are compatibility checks,
  not a throughput comparison or Japanese recognition-quality acceptance.
- The Docker worker also called the loopback-bound Mac server through
  `host.docker.internal`, yielding five segments within source seconds 2–14.
  The worker suite passed with 458 tests and 106 independently gated skips,
  including the new explicitly enabled real-speech test. English/Japanese docs
  production builds and content/link checks passed. Mac-specific logs are in
  `/tmp/videoq-whisper-mac-validation`; the temporary speech services were stopped
  after validation.
- API with PostgreSQL, cross-language checks and Helm: 1679 passed, 38 independently
  gated tests skipped. API typecheck, Node production bundle and generated Worker
  binding checks passed. Native Workers: 32 passed.
- Workflow policy: 168 passed; on-prem release/registry policy: 10 passed;
  Terraform format passed.
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
