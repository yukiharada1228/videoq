---
title: Video navigation and visual evidence
description: Use ReAct tools to survey a lecture, narrow an interval and check visible evidence.
---

# Video navigation and visual evidence

VideoQ's [ReAct-style agent (Yao et al., 2023)](../reference/ai-references.md#react) chooses tools according to the evidence a question needs.
The navigation tools are inspired by [VideoSeek (Lin et al., 2026)](https://arxiv.org/abs/2603.20185),
implemented within VideoQ's existing course access scope and citation registry.
See [the reference and scope of this adaptation](../reference/ai-references.md#videoseek), including the authors' implementation and reusable citation.
They are not a fixed pipeline: a precise timestamp can go directly to a window
or detail inspection, and sufficient subtitle evidence needs no vision call.

| Tool | Purpose | Limit per answer |
| --- | --- | --- |
| `search_scenes` | Find subtitle scenes by meaning | 3 searches |
| `overview_video` | Survey one video's timeline with 12 subtitle excerpts and optional 16 low-detail stills | 2 calls |
| `skim_video` | Locate useful moments in a candidate interval of up to 900 seconds, with 12 subtitle excerpts and optional 8 low-detail stills | 2 calls |
| `read_video_window` | Read consecutive subtitles around a known interval | 3 calls |
| `inspect_clip` | Check diagrams, equations or labels using up to 8 high-detail stills inside a known interval of up to 180 seconds | 2 calls |
| `focus_clip` | Check brief visible steps or changes in a clip of up to 16 seconds using up to 16 high-detail stills, with a one-second baseline and extra scene-change samples | 2 calls |

For a normal concept question, the agent starts with semantic search. When a
diagram has no subtitle clues, it can identify the video with `get_course_info`,
call `overview_video`, skim a promising interval and focus on a relevant short
clip. Every step is optional when the answer already has supporting evidence.
Detected visual questions require a viewing attempt: unknown timestamps start with an overview, and a known short interval uses focus. Subtitle-only results cannot establish visual absence.
The viewing tools return observations and original timestamps; the main agent
produces the answer with citations.

`overview_video` and `skim_video` work with subtitles even when visuals are
disabled, including for YouTube imports. `include_visuals=false` performs no vision call unless the request requires visual evidence; that policy forces image inspection. Their subtitle samples span time instead of taking only the first
cues; each excerpt is capped at 1,000 characters. Sampling, text truncation and
missing evidence are reported explicitly. A sampled timeline is not an exhaustive
summary, and the last subtitle timestamp is not the video's duration.

Q&A can call `read_video_window` after searching to recover neighboring subtitle
cues. This works for uploaded and YouTube videos, requires no additional model
call inside the tool, and preserves original subtitle timestamps. Each answer
allows three reads: a requested interval of at most 180 seconds, up to 30 seconds
of context on either side, and at most 40 cues / 12,000 text characters per read.
The result explicitly reports truncation. It reads the latest saved transcript;
semantic search may still use older data until reindexing finishes.

Image tools are enabled by default for uploaded videos. They check diagrams,
equations and screen contents that subtitles do not establish. Overview and skim
use low image detail to find candidate moments; `inspect_clip` uses high image
detail on the coarse cache. `focus_clip` reads a separate, denser cache to inspect
short-lived visible states and changes. The agent still skips image calls when
subtitles provide sufficient evidence.

## Configuration

The API, Python worker, Docker defaults and Terraform defaults enable uploaded
video image tools and cache preparation. Production uses the following model settings; local development can leave the two visual model settings empty to use `LLM_MODEL`:

```dotenv
VIDEO_VISUAL_ENABLED=true
LLM_MODEL=gpt-4o-mini
VISION_MODEL=gpt-4.1-mini
VISUAL_REASONING_MODEL=
```

Recreate the API and worker to load them:

```bash
docker compose up -d --force-recreate api worker
```

For host-run API development, set the same values in `apps/api/.dev.vars`. The
Python worker needs `ENABLE_HEAVY_PIPELINE=1` for real video processing.
`VISION_MODEL` uses the API's `OPENAI_API_KEY` and `OPENAI_BASE_URL`; empty falls
back to `LLM_MODEL`. The endpoint/model must support image inputs and strict
JSON-schema output. `VISUAL_REASONING_MODEL` selects the planning/answer model when images are required or have been inspected; subtitle-only questions keep `LLM_MODEL`. Both answer models need strict JSON output and tool calling. An empty visual reasoning setting uses `LLM_MODEL`. To opt out,
set `VIDEO_VISUAL_ENABLED=false` on both API and worker. Existing explicit false
overrides remain effective until changed and the processes restarted.

New uploaded videos get coarse and dense frame caches during transcription. A
failed cache does not fail a usable transcript; a warning identifies the affected
video and cache type. Failure of one cache does not prevent attempting the other.
Existing uploads can be backfilled without Whisper or embedding calls. From
`apps/worker`, with database and media storage settings configured:

```bash
python scripts/prepare_visual_frames.py --video-id 42
```

The backfill builds both caches, including dense focus data for older uploads
that already have coarse images. Embedding reindexing does not build frame caches. YouTube imports have no local
video file and cannot use visual inspection. A missing cache is reported to the
agent; it must acknowledge the unverified visuals rather than invent evidence.

## Limits and evidence

- FFmpeg selects at most 240 stills, at least 5 seconds apart. Longer videos use
  a wider interval (`max(5, duration / 240)` seconds). Stills are scaled to fit
  1024 × 1024 and retain their presentation timestamps to millisecond precision.
- One private `media/<file_key>.frames-v1.json` stores the cache, capped at 16 MiB
  including base64. A JPEG is capped at 256 KiB. Cache publication uses the video
  row lock so deletion cannot leave a late-published cache behind.
- The adaptive focus cache selects one real candidate per 250 ms bin, then
  retains a baseline sample each second plus significant RGB scene changes.
  It preserves actual millisecond PTS without duplicating or retiming frames.
  One private `media/<file_key>.focus-v2.bin` atomically stores its index and JPEGs,
  bounded at 512 MiB, 144,000 frames and a 4 MiB index (up to 10 hours).
  Existing `.focus-v1.bin` one-second caches remain readable until backfilled.
  A malformed/replaced v2 pack never silently falls back to an older version.
  No partial cache is published on extraction failure or a limit violation.
- `focus_clip` uses the half-open interval `[start_seconds, end_seconds)` of at
  most 16 seconds and up to 16 dense images. The API reads only the header, index
  and selected images, using three bounded range reads and a matching object
  ETag (plus a missing-v2 probe when using legacy data). It never downloads the whole dense pack. Insufficient remaining image
  budget is reported instead of silently reducing temporal density; the agent must split a dense interval. Image intervals are end-exclusive. An inclusive user endpoint copied into the exclusive-end field is adjusted to include that exact millisecond.
- All four viewing tools share at most 4 visual calls / 48 images per answer.
  Overview and focus use up to 16 images; skim and inspection use up to 8 each.
  These limits are enforced in code even for parallel requests. Image reads and
  model calls are serialized to bound memory. Counting/OCR frames are inspected
  individually; temporal questions compare the ordered images together. Byte-identical
  independently inspected stills reuse their observation while retaining
  every real timestamp. This avoids mixing frames or inventing new stages from
  different descriptions of the same image. All requests within one inspection
  share a 60-second deadline and have no automatic retries.
- The model returns observations by frame index. The server assigns video IDs,
  titles, timestamps and `evidence_type: "visual"`. The UI displays just the
  timestamp, including nonzero fractional seconds for visual evidence (for example,
  `0:27.25`), which links to the sampled frame. This keeps distinct frames within
  the same second distinguishable. Existing citations without this
  optional field remain valid.
- During a streamed answer, the progress row identifies the running tool and its
  activity. Expand it to see each invocation and its completion, error or
  interruption status. These live events contain only tool names, call IDs and
  statuses, not tool arguments, results or images.
- Sparse stills can miss a brief action or a changing equation; use `focus_clip`
  when finer temporal coverage is needed. Adaptive samples can capture some sub-second changes, but still cannot establish unseen paths, exact transition times, or events shorter/subtler than the selection can retain. Legacy caches remain approximately 1 FPS, and source gaps remain gaps.
  Empty observations are not proof of absence. A missing dense cache is reported
  explicitly and is never substituted with coarse images as dense evidence.
  FFmpeg runs during upload/backfill, not during an answer. Visual navigation
  works without subtitle search hits, but there is no visual embedding index.

Image bytes stay out of chat history and public media routes. The selected images
are sent to the configured model service. Saved context contains textual visual
observations. Video deletion and account deletion remove coarse, adaptive and legacy caches even when
the feature has since been disabled, and failed cleanup remains retryable.

## Rollout and comparison

Both checked-in API environments and the worker default to image inspection on.
Deploying the implementation enables it for new uploads unless explicitly
overridden. `worker_visual_enabled=true` is the Terraform default; configure
`VISION_MODEL` on the API if its normal answer model cannot handle images.
No database migration or new cloud service is required. Do not put the
worker flag in SSM's app-secret JSON: the current loader only accepts its listed
secret keys. Use Lambda's environment configuration.

Start with the same uploaded lectures and questions under two settings: visuals
disabled and enabled. Include questions answerable from subtitles, questions
requiring a diagram/equation, brief actions the sampling can miss, and questions
whose answers are absent. Manually label expected answers and supporting times.
Compare answer correctness, unsupported claims, citation timing, total latency,
and provider usage. Run repeated trials because tool selection is model-dependent.

`visual_inspection` logs report viewing mode, frame count, model-call duration and prompt/output
token usage without image bytes, questions or private paths. These are the extra
vision calls, not total Q&A cost. The opt-in `apps/api/test/visual-qa.live.test.ts` evaluator records whole-answer provider usage and real synthetic-video responses. Its successful exit verifies execution; answers still require comparison with ground truth. No post-answer scoring job is introduced.

Derived cache storage is bounded service overhead (up to 16 MiB coarse plus
512 MiB per dense-cache version per video); the
existing user storage quota still counts the original upload, not this cache.
Monitor aggregate cache storage, upload processing time and model usage.
