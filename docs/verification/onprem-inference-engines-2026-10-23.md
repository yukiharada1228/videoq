# Selectable on-prem inference engines — 2026-10-23

> Historical verification of an earlier implementation. Ollama support has since
> been removed; current deployment instructions use llama.cpp or vLLM in
> [the inference chart](../../charts/videoq-inference/README.md). These results
> are retained as historical evidence, not as a current installation recipe.


Scope: remove the shared chat/embedding endpoint constraint, add llama.cpp CPU
and vLLM NVIDIA deployment recipes, and provide common acceptance checks.
Initial downloads are allowed. GPU hardware and the production site are undecided.
This extends the [original local inference acceptance](onprem-local-inference-2026-10-23.md).

## Delivered configuration

- `EMBEDDING_BASE_URL` and optional `EMBEDDING_API_KEY` in API and Python worker.
  Unset values preserve the shared OpenAI base/key. `openai` denotes the protocol.
- Selectable inference chart `backend`: `ollama` (existing default), `llamacpp`,
  `vllm`. The latter two have independent chat/embedding deployments and caches,
  read-only offline runtime weights, nonroot UID 10001 and private Services.
- Matched inference/application profiles, immutable model revisions, GGUF SHA256
  validation, and pinned image digests. The site-built Whisper image also carries
  a provisioning helper for GGUF files and safetensors snapshots. No Python code
  or pickle weights are provisioned for the vLLM recipe.
- vLLM reserves two NVIDIA GPUs (chat and embeddings); Whisper stays on CPU.
  The Qwen3 embedding profile explicitly permits trained Matryoshka dimensions
  at 1536. No GPU sharing or production throughput assumption is made.
- English/Japanese instructions describe endpoint credentials, profile pairing,
  common checks, offline operation and reindexing after any vector-space change.

## Real CPU results

Host: Apple silicon, 16 GiB. Native llama.cpp build 11669, commit `620d2225c`,
with GPU layers explicitly set to zero. Chat uses four threads / 8192 context;
embeddings use two threads / 8192 context, last-token pooling. No hosted inference
keys or services were used. The two APIs listen on separate local ports.

| Model | Repository revision | GGUF SHA256 |
|---|---|---|
| Qwen3-4B Q4_K_M | `bc640142c66e1fdd12af0bd68f40445458f3869b` | `7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5` |
| gte-Qwen2-1.5B-instruct Q4_K_M | `124fbdad7d80e987f3a4d8cd201f721ca37fe9b8` | `a40df5cabb8c70f2fa144bc6a8674c2c987bfe3b4571134c767832aae1d246b9` |

Initial native tools-plus-schema test: four API checks passed, but the RAG agent
answered without performing retrieval. The tested llama.cpp profile therefore
sets `LLM_SEPARATE_TOOL_SCHEMA=true`, as the existing Ollama profile does.
With that setting **all six common checks passed** in 91.43 seconds:

1. Strict cited structured answer.
2. Structured streaming through the application's SSE parser.
3. Function tool call through the actual LangChain adapter.
4. Finite, nonzero 1536-dimensional query vector.
5. Python indexing batch and TypeScript query vectors have cosine similarity
   above 0.999 for identical text; matching text ranks above unrelated text.
6. Production streaming RAG agent performs retrieval and returns numeric source
   IDs and the expected video timestamp. Retrieval evidence is a fixed fixture;
   this is not a live DB/browser end-to-end test.

That duration includes a warm model/prompt cache and is **not** a comparative
throughput benchmark. The current tests establish compatibility, not a runtime
winner or Japanese answer quality.

The worker's actual media pipeline extracted audio from a synthetic speech MP4,
received three timestamped segments from local faster-whisper base, and generated
two 1536-dimensional indexing embeddings from the independent llama.cpp API.
It used `EMBEDDING_API_KEY` and no shared OpenAI key.

The pinned official llama.cpp Linux arm64 image ran as UID 10001 with Docker
`--network none`, read-only root/model files, two CPUs and 2 GiB memory. A real
HTTP embedding batch returned two 1536-dimensional vectors using the profile's
model alias. The container was removed after the check.

The updated site-built Whisper image's provisioning helper also succeeded
against the cached, read-only GGUF models with `--network none`. Trivy 0.76.1,
including unfixed HIGH/CRITICAL findings: **zero** for the pinned Linux arm64
llama.cpp image and the updated Whisper image. vLLM has not been built, scanned
or run on this host; its guide requires a target-architecture scan before use.

## Automated checks

- API unit suite: 1132 passed / 600 independently gated tests skipped. Real-model
  checks above ran separately with all six enabled.
- Helm rendering checks: 13 passed, covering both new profiles, separate private
  endpoints/caches, GPU allocation, immutable revisions, rejected incompatible
  formats and removing downloaders with deny-egress enabled.
- Python Whisper/provisioning checks: 11 passed. Worker embedding/transcription
  checks: 66 passed. Workflow policy tests: 168 passed.
- API typecheck and Node build passed. Documentation typecheck, English/Japanese
  production build and public-content checks passed.
- On-prem CI now lints both new profiles, imports/tests the packaged provisioner,
  and scans/inventories the pinned llama.cpp CPU image as well as existing images.

Local evidence is under `/tmp/videoq-local-ai-validation/llamacpp` on the
validation machine. Dedicated inference processes are stopped after acceptance;
pre-existing Ollama, Docker and Kubernetes workloads are preserved.

## Verification boundaries

vLLM GPU execution, driver/VRAM compatibility, model-parser behavior under the
production tool/schema workload and concurrent performance require actual GPU
acceptance using the same common suite. The vLLM native tool/schema setting is
an initial recipe, not a claim of verified behavior. There is no simulated vLLM
result or inference fallback. The site must choose and validate its final engine.

The inference chart has been rendered/tested but not installed on the eventual
site cluster. Confirm the site's CNI enforces the egress policy and run a real
upload through indexing, cited Q&A and playback. Changing embedding weights,
quantization, pooling or preprocessing requires rebuilding existing embeddings.
Visual inspection remains disabled in these text-model recipes. Whisper remains
an independent local faster-whisper service with the original pinned base model.
