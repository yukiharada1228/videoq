# On-prem Whisper batching — 2026-10-23

The private faster-whisper API now supports batched inference within each audio
request. `whisper.batchSize` in Helm sets `WHISPER_BATCH_SIZE` on the speech
server. CPU defaults to 1 (sequential inference); the NVIDIA overlay selects 8.
Values must be integers from 1 through 64. Invalid configuration fails startup
before loading weights, and invalid chart values fail schema validation.

For values above 1, a request-local `BatchedInferencePipeline` reuses the loaded
model and batches VAD speech chunks. It does not combine independent requests or
wait for additional videos. The existing single-request lock and busy response
remain in place, limiting concurrent GPU memory use. The worker's SQS lanes,
300-second local transcription intervals and `WHISPER_BACKEND=local` contract
remain unchanged. Native Mac whisper.cpp is independent of this server setting.

The pipeline explicitly uses timestamp tokens (`without_timestamps=False`),
restores VAD-compacted times to the original input and preserves the API's
segment response. Real inference returned a final cue beyond the input duration
because of decoder padding. The API now bounds cues to the audio duration and
rejects non-finite timestamps. Failed generator iteration cleans up the audio,
releases the lock and does not reuse mutable batch state on the next request.

## Verification

- Inference tests with the real model enabled: **29 passed in 6.97 seconds**.
  The opt-in real test used cached faster-whisper base weights on CPU/int8.
  A nonsensitive 12.416-second English speech clip was repeated five times with
  10-second silent gaps, producing 112.08 seconds of audio. The real pipeline
  processed **three chunks in one model batch**. The HTTP/SDK response retained
  all five speech regions, source-relative timestamps and the final speech.
  Boundary assertions allow one second for VAD padding/decoder timing; this is
  not a word-level alignment or recognition-accuracy benchmark.
- Ordinary inference suite: **28 passed, 1 explicitly gated real-model test
  skipped**. Coverage includes sequential and batched SDK responses, upload/model
  validation, offline model loading, batch configuration, cue bounds/non-finite
  timestamps and recovery after a batch generator fails.
- Final CPU container built successfully. The production worker sent MP3 to
  that container with batch size 8 and passed the real segment/offset/SRT test
  (**1 passed in 1.88 seconds**). This short request checks compatibility; the
  separate 112-second test establishes actual multi-chunk batching.
- Helm application/inference tests: **14 passed**. CPU/NVIDIA batch defaults,
  custom sizes, rejected invalid sizes and existing chart policies passed.
  English/Japanese documentation production builds and content/link checks passed.

Local logs and JUnit properties are in
`/tmp/videoq-whisper-batching-validation`. All validation used local cached
weights, local speech and temporary services, without DB writes, hosted inference
or model downloads. The temporary speech container was stopped afterward;
existing user workloads were left running.

NVIDIA execution, peak VRAM and speedup have not been measured here. The default
batch of 8 is a configurable starting point, not a measured sizing promise.
Site acceptance must use its actual GPU and Japanese videos, checking recognition
quality, subtitle timing, latency and throughput. Build the updated site-owned
Whisper image and select its new immutable digest when enabling batching.

Implementation follows the pinned
[faster-whisper 1.2.1 batch API](https://github.com/SYSTRAN/faster-whisper/blob/v1.2.1/faster_whisper/transcribe.py).
Final-head CI evidence is linked from the pull request. No merge, release
publication or production deployment is included.
