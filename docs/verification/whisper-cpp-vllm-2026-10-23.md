# whisper.cpp / vLLM runtime validation — 2026-10-23

The NVIDIA vLLM candidate is fast, but its raw Whisper endpoint is insufficient
for the tested subtitle requirements. A private validation frontend with VAD,
bounded utterance grouping, level normalization and timestamp restoration passed
the protocol/source-coverage gate on an L4. Native whisper.cpp on Mac and CUDA
also completed the long-video worker path, with subtitle quality differences.
CPU-only large-v3-turbo on this M4 with four threads did not reliably meet the
current worker timeout. These results support a conditional migration proposal,
not an immediate replacement of the existing faster-whisper deployment.

This change adds reproducible validation tools, a **validation-only** frontend
and evidence. It does not change the production worker, inference chart backend,
existing Modal deployment or release images.

## Test conditions

- Whisper large-v3-turbo, FP16, without weight quantization. vLLM **0.32.0** used
  `openai/whisper-large-v3-turbo` revision
  `41f01f3fe87f28c78e2fbf8b568835947dd65ed9`. whisper.cpp **1.9.5** used source
  `d1be6fde11ac6e0407606b4e42fe72d34add8037`, GGML model repository revision
  `5359861c739e955e79d9a303bcbc70fb988958b1`, and model SHA256
  `1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69`.
- NVIDIA runs used one **L4**, driver **610.57.04**, four allocated CPUs and
  32 GiB host memory. CUDA whisper.cpp was compiled for SM 8.9 with Flash
  Attention. Both servers were measured on the same GPU type, not simultaneously
  on a shared GPU. vLLM used `max-num-seqs=8`, FP16 and GPU memory utilization
  0.70. Models/dependencies were provisioned first; runtime external networking
  was blocked. There were no deployed public test endpoints.
- Mac runs used Apple M4 with Metal or explicitly `--no-gpu`, four inference
  threads and the same GGML model. Existing user containers stayed running;
  the Mac figures are local acceptance results, not universal CPU sizing.
- The source is [Google FLEURS](https://huggingface.co/datasets/google/fleurs),
  Japanese test split, **CC-BY-4.0**. Twelve fixed natural-speech clips contain
  **558 normalized reference characters**. A separate pause case and 20-second
  silence case exercise timestamps and hallucinations. A **618.74-second**
  integration fixture repeats the twelve clips, with **50 source speech regions**.
  It is not fifty independent samples or an unseen ten-minute lecture. Frontend
  tuning used the same twelve clips; this is not a held-out quality comparison.
- Model alias `whisper-local`, Japanese, MP3, `verbose_json` and segment
  timestamps were exercised through the real OpenAI SDK. The long fixture used
  production worker MP3 extraction, three intervals at **0, 300, 600 seconds**,
  source-relative timestamp correction and SRT generation, without storage or DB
  writes. Current client timeouts/retries were retained for that worker check.

## Warm performance and recognition

Single-clip latency is the median of three warm requests for the same
10.44-second clip. Four-request throughput is total input audio seconds divided
by wall time for one warm group, including server scheduling. It is not a
single-video speedup or a saturation benchmark. Source audio contains silence.

| NVIDIA L4 profile | Single clip | Four-request throughput | Natural-speech character edits | Long CER | Long regions with captions |
|---|---:|---:|---:|---:|---:|
| whisper.cpp, greedy, raw | 0.480 s | 24.19 audio s/s | 29 / 558 (5.20%) | 8.65% | 48 / 50 |
| vLLM, greedy, raw | 0.274 s | 75.85 audio s/s | 29 / 558 (5.20%) | 12.35% | 46 / 50 |
| whisper.cpp, beam 5, raw | 0.604 s | 16.94 audio s/s | 25 / 558 (4.48%) | 8.65% | 48 / 50 |
| whisper.cpp, beam 5, native VAD | 1.168 s | 9.25 audio s/s | 44 / 558 (7.89%) | 11.02% | 50 / 50 |
| vLLM, greedy, VAD + normalized frontend | 0.586 s | 37.86 audio s/s | 29 / 558 (5.20%) | 5.81% | 50 / 50 |

The fair raw greedy comparison shows about **1.75× lower single-request latency**
and **3.14× higher four-request throughput** for vLLM in this test. The raw
whisper.cpp API serializes requests; vLLM can schedule them concurrently. These
are serving-stack results, not a claim that each vLLM kernel is that much faster.
Beam-5 whisper.cpp must not be compared with greedy vLLM as equal decoding.

The vLLM beam-5 warmup request for the same 10.44-second clip exceeded the
**120-second deadline**. No claim about beam-5 throughput is made. The pinned
[vLLM documentation](https://docs.vllm.ai/en/v0.32.0/serving/online_serving/speech_to_text/)
also identifies Whisper beam-search efficiency as an optimization issue.

CER uses NFKC/case normalization and removes punctuation/whitespace. Numeric and
kanji spelling differences still count. Twelve readings are a pilot, not a
Japanese quality guarantee. The reference contains no word-level timestamp
annotations. Checks cover valid/ordered source times and matching text in known
source windows, not independently measured word-alignment precision.

## Silence, quiet speech and the validation frontend

Both raw runtimes emitted **14 normalized characters on 20 seconds of silence**,
with timestamps outside the input duration. VAD removed that failure. VAD alone
did not fix every long-audio omission in vLLM: a quiet source clip, about
**−41 dBFS peak**, was recognized in isolation but missed inside the combined
recording. A local diagnostic confirmed that it was absent from the detected
speech spans.

The final vLLM experiment used bundled Silero VAD 6.2.3 / ONNX Runtime 1.31.0 and
FFmpeg `dynaudnorm=f=250:g=5:m=100` before VAD. Nearby speech regions are grouped
only within a 30-second span and across gaps of at most one second. Up to four
utterances are sent concurrently to the private vLLM server; returned timestamps
are restored once to source time and bounded by each span/input duration. A
text-only response cannot become an invented one-second subtitle.

That profile returned captions for **50/50** source regions and matched each
region's reference with less than 50% character error in its source window.
This coarse region gate detects large omissions/misplaced text; it does not
assert error-free transcription. Aggregate long-fixture CER fell from **12.35%**
to **5.81%**. All three production-worker intervals completed in **9.04, 8.90 and
1.07 seconds**, with valid offsets/SRT. Silence produced no text or captions.

Native whisper.cpp VAD on Mac/CUDA also covered 50/50 regions, but only 35/50
passed that stricter region-text gate. This can include coarse cues combining
neighboring text, rather than entire missing utterances. The native profile
therefore does not pass every strict source-coverage check. Noise, conversations,
overlapping speakers and unseen site videos remain outside this pilot. The
normalizing frontend is an experiment, not a production service entrypoint.

## Mac, CPU and resource observations

- M4 Metal, beam 5: raw median **2.09 s**, native-VAD median **2.12 s**. The VAD
  profile completed the three long worker intervals in **16.67, 17.58, 2.41 s**.
  Natural-speech CER was **7.35%** with VAD; the long-fixture CER was **11.06%**.
- M4 CPU-only, four threads, turbo, native VAD: median **23.55 s**. Sequential
  short cases returned valid segments, but some concurrent requests and the
  second 300-second worker interval timed out. The first interval's **242.52 s**
  is worker wall time including SDK retries, not pure inference. Its incomplete
  long transcript is excluded from recognition-accuracy comparisons. This
  checkpoint/thread/timeout combination is not an accepted CPU deployment.
- Cold vLLM model/engine startup took approximately **111–119 s**; cached-model
  CUDA whisper.cpp startup took approximately **5 s**. Model download/build time
  is excluded from inference measurements.
- Post-run GPU allocation was about **2,106 MiB** for whisper.cpp and
  **15,923 MiB** for the final vLLM profile. The latter includes its configured
  70% memory reservation; these are observed allocations, **not peak measurements
  or minimum-VRAM requirements**. Only the tested L4 configuration is established.

## Reproduce and audit

Compact metrics, failures and SHA256 values of the raw local result artifacts
are in [whisper-runtime-results-2026-10-23.json](whisper-runtime-results-2026-10-23.json).
Detailed local responses/logs remain under `/tmp/videoq-whisper-vllm-validation`.
The immutable dataset conversion revision is
`168de341b3db6859a9bac1c50a2ef5e3b47647e0`; the Parquet SHA256 is
`e954b67e934b9a31d7a74a070a75225379660d50c8d1aacdb755852c57f23e6b`.

From a reviewed checkout with the worker development environment and FFmpeg:

```sh
curl --fail --location --output /tmp/fleurs-ja-test.parquet \
  https://huggingface.co/datasets/google/fleurs/resolve/168de341b3db6859a9bac1c50a2ef5e3b47647e0/ja_jp/test/0000.parquet
uv run --no-project --python 3.12 --with pyarrow==26.0.0 python \
  apps/worker/scripts/prepare_whisper_validation.py /tmp/fleurs-ja-test.parquet /tmp/whisper-fixtures
cd apps/worker
VIDEOQ_WHISPER_VALIDATION_ENGINE=vllm VIDEOQ_WHISPER_VALIDATION_VAD=1 \
VIDEOQ_VALIDATION_AUDIO_NORMALIZE=1 .venv/bin/python -m modal run \
  scripts/modal_whisper_runtime_validation.py --fixtures /tmp/whisper-fixtures --output /tmp/vllm-result.json
```

The GPU command uses the operator's authenticated Modal workspace, one L4, one
container and a 20-minute execution cap. It incurs compute usage; it does not
deploy a persistent endpoint. Raw comparisons omit both VAD environment settings.
Select `VIDEOQ_WHISPER_VALIDATION_ENGINE=cpp` and `--cpp-beam-size 1` for the
matching greedy CUDA profile. Known failing profiles intentionally exit nonzero
after saving evidence. Native servers can use `scripts/whisper_runtime_validation.py`
with `--base-url`, `--fixtures` and `--output`.

Unit tests verify that missing timestamps, hallucinated text-only silence,
invalid times, missing results, duplicate offsets and unrelated text overlapping
a source region cannot silently pass. Final worker/CI results are linked from
the pull request. All temporary GPU apps and native servers were stopped; the
existing deployed Modal service and user containers were untouched.

Adoption should package the required audio dependencies/frontend, select a CPU
checkpoint and timeout budget, and validate actual site recordings/hardware.
The existing production selection remains faster-whisper until that separate
deployment change is made and accepted.
