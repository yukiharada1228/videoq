# Optional browser video compression — 2026-10-12

## Behavior

The upload dialog defaults to the original file. Users can instead choose 1080p (up to 60 fps) or 720p (up to 30 fps), with aspect ratio preserved and no upscaling. H.264 target rates are 8 Mbps for high-frame-rate 1080p, 5 Mbps for other 1080p, and 2.5 Mbps for 720p. These are encoding targets, not guaranteed output sizes or quality scores.

The local source is read through a BlobSource with an 8 MiB cache. WebCodecs conversion runs in a dedicated worker and writes the MP4 to origin-private storage with 2 MiB buffered writes/backpressure. The complete source/output is never explicitly read into an ArrayBuffer. Regular MP4 writes media to disk and retains sample metadata; memory still grows with sample count and codec resources. This is not a claim of constant total process memory.

Only the finished, smaller MP4 is passed to the existing upload API. Its actual bytes are used for per-file checks, server storage reservation and multipart uploads. Original files above the upload limit may be selected for compression, but the output must pass the same server quota. Failure, cancellation and unsupported media do not silently upload the original. The original file is never modified or deleted. Temporary output is disposed after upload or failure. A forced browser/process shutdown may leave origin-private temporary data; no startup sweep or upload-resume feature is included.

Capability detection keeps original upload available on unsupported browsers. Single-video sources are supported; HDR or discarded tracks are rejected rather than silently losing content. Audio is copied when MP4 supports it, otherwise the library's supported conversion path is used. All detected audio tracks must survive initialization. Free disk quota is checked approximately and enforced by actual writes as well. Closing the page terminates this local workflow; long conversions require keeping the page/device active.

Storage/traffic can decrease; video duration and time-based transcription cost do not. The price catalog and plan quotas are unchanged. No original or existing production video is deleted and no new cloud transcoding service is introduced.

## Browser/media verification

Local macOS Chrome with hardware H.264 support, using a stream-copy excerpt from the previously supplied 45,159,504,400-byte 1080p60 H.264/AAC gameplay MKV. Keyframe seeking produced a 16.031-second, 87,054,088-byte fixture.

| Setting | Result | Dimensions / frame rate | Local elapsed time |
| --- | --- | --- | --- |
| Original | 87,054,088 bytes | 1920×1080 / 60 fps | — |
| 1080p | about 16.47 MB (81% smaller) | 1920×1080 / 60 fps | about 6–10 seconds |
| 720p | about 5.43 MB (94% smaller) | 1280×720 / 30 fps | about 2–4 seconds |

These short-interval results do not establish full-file compression time or savings. Both outputs were decoded through FFmpeg and frames were visually inspected. Small HUD details degrade more at 720p. All 751 source AAC packet payload hashes were identical in both outputs. Container conversion changes leading AAC priming handling: decoded PCM hashes are not identical, and sample output durations differ by about 10 ms. Do not describe this as a bit-identical audio/timeline round trip.

A second fixture with two AAC tracks, one delayed by 1.2 seconds, retained both tracks and the delayed track's 1.2-second placement; output duration differed by less than 1 ms. Additional Chrome checks covered a 1 MiB output quota, corrupt media, and a real 45.16 GB input that was canceled after its first progress event (about 2.7 seconds). The latter exercises reading, initialization, beginning conversion and cancellation, not completion of the entire 45 GB recording. All normally completed/canceled/error attempts left the dedicated temporary directory empty.

## Application checks

- Full frontend unit suite: 1,275 passed before adding four worker-controller tests; the four added tests also pass.
- Type checking, ESLint and production build pass. The media library is emitted in the separately loaded compression worker, approximately 566 kB uncompressed.
- All 621 Storybook cases were exercised: 620 passed on the broad run; an unrelated Admin pending-deletion fixture timed out waiting for its data. The full Admin suite plus all upload stories passed on the focused rerun (72 cases), with no Admin source changes.
- Japanese desktop, English 390px mobile and Japanese mobile cancel states were inspected. The dialog uses an inner scroll area so the submit/cancel buttons remain accessible on short screens. Radio selection/keyboard navigation, disabled and unsupported states, compression progress/failure, and stopping compression with inputs retained have story coverage.
- No production upload, transcription charge or full 45 GB conversion was performed for these checks.

## Dependencies

[Mediabunny conversion documentation](https://mediabunny.dev/guide/converting-media-files), [streamed file output](https://mediabunny.dev/guide/writing-media-files) and [format/codec support](https://mediabunny.dev/guide/supported-formats-and-codecs) informed the implementation. Runtime codec support is checked rather than inferred solely from filename. The unmodified Mediabunny 1.61.3 dependency is MPL-2.0; its notice, license and source link are served at `/licenses/mediabunny.txt`.
