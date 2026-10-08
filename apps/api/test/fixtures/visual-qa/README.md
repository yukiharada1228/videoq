# Visual evidence regression fixture

`clip.mp4` is the 30-second synthetic video used in the production check on
2026-10-08. Its narration intentionally does not disclose any visual answers.
`questions.json` and `ground-truth.json` are evaluation data only: the model sees
only the question, sampled video images and a generic transcript.

The cases cover OCR without a supplied timestamp, colors and left/right order,
object counts by row, motion direction, scene order, a false premise and a
400 ms color change. Q8 in the live runner repeats OCR without an explicit
instruction to inspect images.

`variation.mp4` is a held-out variation: seven circles (four above, three below),
right-to-left movement and code G6T9. Regenerate it with Python/Pillow and FFmpeg:

```sh
python3 apps/api/test/fixtures/visual-qa/generate_variation.py
```

Run a real-model evaluation from the repository root (billable, explicitly opt in):

```sh
VIDEOQ_VISUAL_EVAL=1 npm run test:unit --workspace @videoq/api -- test/visual-qa.live.test.ts
VIDEOQ_VISUAL_EVAL=1 VIDEOQ_EVAL_VARIATION=1 VIDEOQ_EVAL_CASES=Q3,Q4,Q8 npm run test:unit --workspace @videoq/api -- test/visual-qa.live.test.ts
```

`VISION_MODEL` changes image recognition without changing `LLM_MODEL`.
`VISUAL_REASONING_MODEL` optionally selects the agent model for visual questions;
text-only questions retain `LLM_MODEL`. For the comparison candidate, set both
visual model variables to `gpt-4.1-mini`. The API
key comes from the environment or the ignored root `.env`. The test requires the
worker's local Python environment and FFmpeg. It builds the actual caches and
runs the real RAG agent and image model, with fixture adapters for storage and
repositories. It does not upload or mutate production records.

Results under `output/visual-accuracy-fix-20261008/` include answers, evidence,
selected tools, actual usage and latency. **Passing this opt-in test means the
pipeline completed, not that the answer is correct.** Review every answer and
its visual observations against the ground truth; do not report semantic
success from the Vitest exit code alone. Keep unsuccessful runs for comparison.

Ordinary CI is offline and skips this test. Regression tests separately cover
mandatory visual tool selection, inclusive versus exclusive boundaries, real
FFmpeg extraction of a 400 ms change at 20/30 FPS, legacy-cache compatibility,
frame budgets, citation indices and storage cleanup.

Deployment requires both API and worker updates. Existing uploads keep using
legacy one-second caches until rebuilt with the updated operator script:

```sh
python apps/worker/scripts/prepare_visual_frames.py --video-id <id>
```

That script regenerates visual caches without transcription or embedding API
calls. Frame sampling is still incomplete: changes shorter than the candidate
interval, subtle scene differences and gaps in the source may be missed.
