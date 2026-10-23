# On-premises Whisper adoption — 2026-10-23

The current deployment uses **whisper.cpp 1.9.5 on CPU** and **vLLM 0.32.0 on
NVIDIA GPUs**. The application selects `WHISPER_BACKEND=local` and calls the
private `whisper-local` API. The chart selects `whisper.backend=whispercpp|vllm`.
The old faster-whisper runtime, its batching knobs and Modal backend are removed.
Chat and embeddings retain their separate llama.cpp / vLLM services.

Both speech engines sit behind the same bounded frontend: FFmpeg 9.0.2 level
normalization, bundled Silero VAD 6.2.3, real segment timestamps and restoration
of source offsets. Only touching or overlapping VAD padding is merged. Keeping
detected gaps avoids losing a quiet utterance when it is decoded with a louder
preceding utterance. The service never fabricates timestamps for text-only output.
Models download during provisioning; serving can run with external egress denied.

## Final runtime evidence

[Machine-readable results](./onprem-whisper-adoption-2026-10-23.json) include
source fingerprints, worker interval timings, source coverage and limitations.
The fixtures are twelve natural Japanese recordings from Google FLEURS ja_jp
(test split, CC BY 4.0), revision
`168de341b3db6859a9bac1c50a2ef5e3b47647e0`.

| Property | CPU | NVIDIA |
| --- | --- | --- |
| Runtime | Actual distroless Linux ARM64 image, 2 vCPU / 4 GiB on an M4 host | Actual engine image recipe, L4 / driver 610.57.04 / 23,034 MiB |
| Model | `ggml-small-q5_1.bin`, pinned revision and SHA-256 | `openai/whisper-large-v3-turbo`, pinned revision |
| Audio | 150.02 seconds, each of 12 recordings once | 618.74 seconds, the same recordings repeated into 50 regions |
| Application intervals | 30 seconds | 300 seconds |
| Worker request times | 45.34 / 46.91 / 82.23 / 47.64 / 33.58 / 0.35 seconds | 9.71 / 9.22 / 0.91 seconds |
| Covered source regions with matching text | 12 / 12 | 50 / 50 |
| Character error rate | 86 / 558 = 15.41% | 154 / 2,323 = 6.63% |
| SRT cues round-tripped through the production parser | 18 | 59 |
| Protocol / source-coverage failures | 0 | 0 |

Coverage requires both timestamp overlap and per-region normalized CER below
0.5; it is stronger than counting any caption over a source region. Global CER
uses the portable verifier's Japanese text normalization. Every SRT cue retained
its text and source times within 0.51 ms after parsing. The final 20 ms CPU tail
completed without inventing a caption.

The final CPU image separately transcribed the public short clip and returned
no captions for twenty seconds of silence inside an isolated Docker network.
An external TCP connection failed as required. The NVIDIA test used the final
frontend source and the same pinned static FFmpeg 9.0.2 as the deployed image;
serving egress was blocked. The engine ran as UID 10001. Its warm single-clip
median was 0.406 seconds, and two simultaneous requests achieved 41.21 audio
seconds per wall second. Cold startup took 109.17 seconds. The observed 15,922
MiB allocation includes vLLM's configured reservation and is not a minimum or
peak VRAM requirement.

The NVIDIA lab ran as a temporary private Modal L4 experiment using only public
fixtures. It exposed no production endpoint, retained no deployed application,
and does not introduce a Modal dependency into the on-premises product. The
production recipe uses separate gateway and engine containers in one Pod.

## Rejected configurations

- CPU base FP16 with 300-second application intervals exceeded the upstream
  deadline on both full intervals.
- Small Q5 with 60-second intervals and merging gaps up to one second completed,
  but omitted the quiet source region at 76.06–84.94 seconds (11/12 coverage).
- Preserving detected gaps fixed that omission, but one 60-second interval then
  exceeded the 110-second frontend deadline. The final CPU profile uses 30
  seconds and completed every interval, including the quiet recording.
- Earlier measurements in the historical comparison report used different
  preprocessing. The table above describes the adopted final configuration.

## Validation and deployment limits

The worker suite, gateway tests, Helm validation, workflow policy tests and
public-content checks cover the adopted contract. The real CPU smoke test also
runs in CI; Linux model-cache permissions are explicitly tested with the serving
UID. CI builds the NVIDIA image, checks its actual audio extras (`av`, `soxr`,
`soundfile`) and scans both images for HIGH/CRITICAL vulnerabilities including
unfixed findings. Require successful checks on the exact PR head before rollout.

These clips were also used to tune preprocessing. They are a functional pilot,
not an independent quality benchmark or a comparison of equal models. CPU
processing was slower than real time on this constrained host. Deployment-site
recordings, hardware capacity, concurrent users and GPU chat/embedding execution
still need acceptance testing. The complete NVIDIA example requests three
separate GPUs for chat, embeddings and speech. Finish existing transcription
plans before changing the application interval profile.

Reproduction uses the current image recipes and pinned chart models, the
opt-in `apps/inference/whisper/tests/test_real_container.py` smoke test, and
`apps/worker/scripts/whisper_runtime_validation.py` with the fixture manifest.
The portable verifier supports admission-matched concurrency (CPU 1, NVIDIA 2)
and `--run-worker-intervals`; set `WHISPER_CHUNK_SECONDS=30` for CPU. Raw local
artifacts are in `/tmp/videoq-whisper-runtime-implementation` and are not needed
by the serving image.
