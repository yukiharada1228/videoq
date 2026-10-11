# Visual decode efficiency — 2026-10-12

## Change

The minute-chunk extractor first uses FFmpeg `-skip_frame noref` to skip non-reference frames before selecting the one-image-per-second cache. It retains actual source PTS and the existing image resolution and JPEG quality. If the result does not cover every source-second bucket in the chunk, it discards that attempt and repeats with full decoding. Low-frame-rate B-frame videos and source gaps therefore retain the previous sampling behavior.

[FFmpeg documents `noref`](https://ffmpeg.org/ffmpeg-codecs.html) as discarding non-reference frames. This does not mean keyframes only: the retained reference frames still cover every second on the measured source. The fast path can select a slightly later frame within a second; timestamps describe that actual frame. Sub-second events remain outside the guaranteed coverage of this still-image workflow.

## Measured source and results

Local macOS FFmpeg, the same 45.16 GB / 2h34m49.617s H.264 1080p60 recording used for production verification. Decoder threads: 2; filter and MJPEG encoder threads: 1; 1024px maximum dimension, quality 8. Each run read the original file and produced the normal 60-image pack. The order was baseline → optimized at minute 94, then optimized → baseline at minute 90.

| Source minute | Baseline wall time | Optimized wall time | Baseline CPU | Optimized CPU | CPU reduction |
| --- | --- | --- | --- | --- | --- |
| 94 | 38.14s | 29.48s | 57.70s | 30.74s | 46.7% |
| 90 | 37.94s | 31.43s | 52.11s | 30.06s | 42.3% |

Both optimized packs cover all 60 seconds. Maximum sample timestamp shift versus full decoding: 33ms. JPEGs at identical selected timestamps remain comparable; 22/60 and 27/60 timestamp-and-JPEG pairs were byte-identical. This is a CPU optimization, not a claim that every selected frame is identical.

This is a two-interval local benchmark, not an AWS billing measurement. Wall-time reductions were 17–23%; Lambda billing depends on wall time and allocated memory, so a 42–47% CPU reduction must not be represented as a matching reduction in the cloud bill. Codecs and frame reference structures can yield different results. Sparse sources that need fallback incur an additional bounded decode attempt.

## Correctness checks

Real FFmpeg tests cover delayed video PTS, minute boundaries, fractional final seconds, and a one-second red scene in B-frame sources at both 30fps and 1fps. The 1fps case exercises full-decoding fallback and preserves all eight source seconds and the red scene. The existing bounds on duration, subprocess resources, JPEG sizes and pack timestamps remain in force.

The on-disk cache format and readers are unchanged. Already-prepared videos do not need regeneration.
