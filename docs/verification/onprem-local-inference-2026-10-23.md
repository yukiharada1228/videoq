# Local AI inference acceptance — 2026-10-23

> Historical verification of an earlier implementation. Ollama support has since
> been removed; current deployment instructions use llama.cpp or vLLM in
> [the inference chart](../../charts/videoq-inference/README.md). These results
> are retained as historical evidence, not as a current installation recipe.


Scope: implement optional on-prem chat, embeddings and Whisper deployment.
Initial image/model downloads are allowed. Video, audio and inference requests
should stay on the site. Hardware is undecided; CPU acceptance and NVIDIA
deployment settings were requested.

## Implemented

- Separate `charts/videoq-inference` release: private Ollama and faster-whisper
  APIs, persistent model caches, pinned Whisper revisions, initial provisioning,
  readiness checks, optional GPU scheduling and ingress/egress policies.
- `charts/videoq/examples/local-ai.yaml` switches all three AI functions to local
  services, disables text-model visual inspection and restricts app egress.
- Local chat compatibility mode separates tool decisions from final native JSON
  Schema output. Intermediate draft prose is discarded. Hosted defaults retain
  the original behavior. CPU request deadlines are configurable.
- Minimal nonroot Whisper image with locked Python/CUDA dependencies, local-only
  model loading, read-only runtime weights, no public model-management API, and
  no automatic hosted fallback. Unknown worker backend names are rejected.
- English/Japanese installation documentation and reproducible API/worker
  acceptance commands. CI builds/scans the new CPU image and tests its ASGI
  boundary; dependency updates include the new package and image.

## Actual CPU results

Host: Apple silicon, 16 GiB RAM. Ollama 0.40.9 ran in a dedicated process and
cache. CPU aliases explicitly set `num_gpu 0`; logs show `offloaded 0/37 layers`
and `/api/ps` reported zero VRAM. No hosted inference credentials were used.

| Component | Model / immutable identity |
|---|---|
| Chat | qwen3:4b, `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7` |
| Embeddings | qwen3-embedding:4b, `df5bd2e3c74cd8d069d21dc038f1b359fcdc9458fce1c99bd43c9eb1518ff907` |
| Whisper | Systran/faster-whisper-base, `ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66` |

- Five real-model API checks passed: cited structured answer, SSE parsing,
  function tools, 1536-dimensional query embeddings, and the production
  streaming RAG agent returning timestamp citations from fixed retrieval evidence.
  That suite took 325 seconds in this CPU environment. Retrieval was a test
  fixture; this was not a fresh database/UI end-to-end test.
- The actual worker extracted audio from a synthetic 15.93-second MP4, received
  three timestamped Whisper segments and generated two 1536-dimensional indexing
  vectors. The fixture describes seven-day database backup retention.
- Final Linux arm64 Whisper image completed a real HTTP transcription with
  Docker `--network none`, CPU-only, read-only model files, 1 GiB memory and two
  CPUs. The expected seven-day statement was recognized.
- The pinned Linux arm64 Ollama image started as UID 10001 with a read-only
  model cache and `--network none`; both configured models were discoverable.
  Its pinned image is
  `sha256:5c6707fcf2e1a30cffe2ecb7e315584fc87747c389327e4bc711c4959aa1eecc`.
  Trivy HIGH/CRITICAL including unfixed: **0 findings** for its OS and Go binary.
- The final image provisioned the pinned model using a temporary writable cache.
  Provisioning against the cached read-only model also succeeded with network
  disabled, demonstrating that cached restarts require no model download.
- Final Whisper image ID:
  `sha256:78e8d163c0b53eb0071e3d5f6be471383fb6f132ec12d68f8511e1b4f7027f12`.
  Trivy 0.76.1, HIGH/CRITICAL including unfixed: **0 findings** for Debian and Python.
  Extra copied native libraries retain their package inventory and licenses.

## Automated checks

- API unit suite: 1127 passed, 599 skipped (DB/Workers/explicit real-model suites
  are independently gated); the five real-model checks above ran separately.
- Workflow/dependency policy: 168 passed.
- Python deployment/security policy: 38 passed; canonical runtime checks passed.
- Whisper ASGI/SDK tests: 5 passed. Worker transcription tests: 15 passed.
- API typecheck and Node build passed.
- Application local overlay and inference CPU/NVIDIA Helm variants passed lint
  and rendering tests. English/Japanese documentation build and public-content
  checks passed.

Local logs and reports are under `/tmp/videoq-local-ai-validation` on the
validation machine. They contain synthetic test data, no deployment secrets.

## Remaining site acceptance

The companion chart has not yet been deployed on the eventual site cluster.
NVIDIA drivers, GPU inference, Japanese model quality and production throughput
remain unverified. The GPU example requests two GPUs and configures no sharing.
The CPU baseline disables image-based visual inspection; a local vision model
needs separate acceptance before that feature is enabled.

The site's CNI must enforce NetworkPolicy; confirm public egress is blocked and
private DB/S3/queue/inference connectivity works. Then run a complete real upload
through indexing, cited streaming Q&A and playback. This change's real RAG test
uses fixed retrieval evidence and does not replace that site acceptance.

The new Whisper image is site-built, outside the existing signed three-image
GHCR release. Existing embeddings need rebuilding when switching models.
Email, Google OAuth, Stripe and YouTube/SearchAPI are separate external features.
