# Retire Ollama support — 2026-10-23

The user chose to simplify local inference support. This change removes the
Ollama-specific runtime/deployment path across the application, with llama.cpp
as the CPU default and vLLM retained as the NVIDIA GPU recipe. It is stacked on
the on-prem application-edition change in PR #1144.

## Delivered behavior

- TypeScript query embeddings and Python indexing use one OpenAI-compatible
  protocol. `EMBEDDING_BASE_URL` / `EMBEDDING_API_KEY` remain independent of chat.
  The dedicated `/api/embed` adapter and its environment bindings are removed.
  An old `EMBEDDING_PROVIDER=ollama` fails before HTTP without a hosted fallback.
- The inference chart defaults to `llamacpp`. It provisions private chat,
  embedding and Whisper APIs with three independent persistent caches. CPU model
  revisions, SHA256 checks, image digests, non-root/offline serving and read-only
  model mounts are retained. vLLM remains optional with pinned model snapshots.
- The Ollama image, deployment, service, PVC template, port 11434, values and
  application overlay are removed. Helm schemas reject retired backend/options.
  The old NVIDIA overlay is replaced with `whisper-nvidia.yaml`: one extra GPU
  for Whisper, leaving the selected chat/embedding backend unchanged.
- On-prem CI scans and inventories the remaining five images (API, worker, web,
  local Whisper and llama.cpp), without changing unfixed HIGH/CRITICAL gates.
- Compose, Wrangler/generated bindings, Node configuration, developer templates,
  diagnostics and English/Japanese guides use the same protocol. The Docker API
  startup script now forwards the separate embedding URL/credential.
- Application chart version is 0.2.0; inference chart version is 0.3.0. Historical
  reports are retained and explicitly marked as earlier implementation evidence.

## Actual verification

- API unit suite with Helm: 1130 passed, 600 independently gated tests skipped.
- Native Cloudflare Workers tests: 32 passed. Node API production bundle built;
  API typecheck and regenerated-binding check passed.
- Worker suite: 463 passed, 105 independently gated tests skipped. Both languages
  cover rejecting the removed provider before network access, fixed dimensions,
  invalid output, errors and private endpoint/credential selection.
- Workflow policy: 168 passed; on-prem release/registry policy: 10 passed.
- Default, vLLM and Whisper-CUDA chart profiles passed Helm validation. Their
  emitted manifests contain no retired workload, image, environment or port.
- English/Japanese documentation production builds and public-content checks passed.

Real inference ran on Apple silicon using llama.cpp build 11669 (commit
620d2225c), matching the pinned server build, with GPU layers disabled. Existing
reviewed GGUF files were used offline: Qwen3-4B Q4_K_M chat and native
1536-dimensional gte-Qwen2-1.5B Q4_K_M embeddings. Two dedicated loopback servers
were used; no hosted inference or existing application DB was contacted.
All six acceptance tests passed in 260.12 seconds: native structured/cited
answers, SSE, tool calls, query vectors, TypeScript/Python embedding-space
agreement and production streaming RAG with fixed retrieval evidence. This is
an interface/contract check, not a model-quality evaluation or a full browser
upload test. Dedicated processes were stopped after validation.

Local logs are at `/tmp/videoq-remove-ollama-validation`. Final PR-head CI and
Kubernetes lifecycle evidence are recorded on the pull request.

## Upgrade boundaries

Existing installations need a planned switch of both API and worker to matching
private model aliases/endpoints, with backups and complete scene-vector
regeneration before resuming Q&A. Equal dimensions do not preserve vector spaces.
Legacy caches are not converted to GGUF/safetensors and retained PVCs are not
automatically deleted. Follow the current inference/embedding guides rather than
reusing removed overlays or `--reuse-values` containing retired settings.

No installed site, original dirty workspace, user Ollama service, or pre-existing
Docker/Kubernetes workload was changed. This source change does not publish
release images or merge earlier PRs. vLLM/Whisper GPU hardware execution remains
subject to acceptance on the actual site; CPU evidence does not prove it.
