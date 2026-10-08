# Visual model comparison — 2026-10-09 JST

Recommendation: use **gpt-4.1-mini for image recognition only**, retaining gpt-4o-mini for planning and answers. This combination improved row counting and avoided incorrect extra vertical movement in the variation while costing less than changing both models. This is a small synthetic regression comparison, not a general accuracy benchmark. It does **not** establish that all remaining visual errors are resolved.

## Cost

All configurations use the repaired evidence-selection/cache pipeline and the same eight primary questions. The model receives neither ground truth nor expected answers. Each primary run made 29 API calls, including tool planning, image recognition and answer generation. Values use returned API token usage and standard prices, including reported cached tokens; they are **estimates, not billing-invoice totals**.

| Image model / answer model | 8-question estimated USD | Mean per question | Same usage priced without cache discount |
| --- | ---: | ---: | ---: |
| 4o-mini / 4o-mini | $0.1174905 | $0.0146863 | $0.1217913 |
| 4.1-mini / 4o-mini (recommended) | $0.0213495 | $0.0026687 | $0.0298743 |
| 4.1-mini / 4.1-mini | $0.0293528 | $0.0036691 | $0.0504728 |

The recommended configuration was **81.8% cheaper** in these runs. Without cache discounts, the same recorded usage is **75.5% cheaper**. Prompt caching and generated output differ between runs, so this is not a guaranteed percentage for production. Video decoding, cache storage and other infrastructure are excluded. The permission-list change itself does not generate inference calls.

Rates checked against the [4o-mini model page](https://developers.openai.com/api/docs/models/gpt-4o-mini) and [4.1-mini model page](https://developers.openai.com/api/docs/models/gpt-4.1-mini): USD per million input/cached-input/output tokens are 0.15/0.075/0.60 and 0.40/0.10/1.60 respectively. Image tokenization differs; comparing text-token unit prices alone is misleading for this workload.

## Manual semantic review

The primary clip has 5 circles (3 above, 2 below), left-to-right movement, code R8K2, and a red **rectangle** visible only during [27.20, 27.60). The variation has 7 circles (4 above, 3 below), right-to-left movement and code G6T9. Both use the same synthetic visual style; the variation is a regression check, not independent validation on real lectures.

| Case | 4o-mini image baseline | Recommended image-only change |
| --- | --- | --- |
| Q1 code + time | R8K2, 20 seconds: correct | R8K2, 20 seconds: correct |
| Q2 left-to-right shapes | Correct colors/basic shapes; square described broadly | Same; no unsupported square subtype |
| Q3 count and rows | Incorrectly says all 5 are in one row | Correct: 5 total, upper 3 / lower 2 |
| Q4 motion | Coarse left-to-right direction correct | Correct direction; added per-frame narrative is approximate, including a claim of movement at 11 seconds when the fixture is still at the initial position |
| Q5 sequence | Correct square/triangle/star order at basic-shape level | Correct orange quadrilateral → cyan triangle → purple star; square subtype left unspecified |
| Q6 false premise | Correctly does not invent a cat | Same; wording still overstates whole-interval absence instead of explicitly limiting it to sampled frames |
| Q7 400 ms event | Detects red at 27.25 but incorrectly says right side | Detects central red quadrilateral at 27.25 and blue again by the 27.75 sample; exact onset/end and rectangle subtype are not established by the answer |
| Q8 implicit visual OCR | R8K2 and time correct | R8K2 correct, citation targets 20 seconds; prose omits the requested time |
| Variation Q3 | Earlier 4o-mini testing miscounted 7 as 8 | Correct: 7 total, upper 4 / lower 3 |
| Variation Q4 | Not in the final baseline run | Correct right-to-left direction without extra vertical claims |
| Variation Q8 | Not in the final baseline run | G6T9 correct, citation targets 20 seconds; prose omits the requested time |

The both-models candidate included correct core primary answers, but its variation added incorrect upper-screen positions and said that a displayed time was absent. It is not a demonstrated improvement over changing image recognition alone.

No overall "11/11 accurate" claim is made. The automatic live test checks completion and leakage only. Remaining issues include geometric subtype precision, incidental spatial/temporal details, explicit sampling caveats, requested timestamps in answer prose, and citation grouping. Review the linked JSON answers and sources rather than treating a green Vitest result as semantic success.

## What changed in the pipeline

- Clear visual requests must attempt image inspection; unknown timestamps use overview, short known intervals use focus. Subtitle misses never establish visual absence.
- Adaptive v2 caches consider real frames at 4 FPS and retain a one-second baseline plus significant changes. The 400 ms fixture is captured at 27.25 seconds, including a separate 30 FPS extraction regression.
- Individual stills are used for counts/OCR; ordered images are compared together for motion and sequence. Exact duplicate individual images reuse observations.
- One-based image indices are mapped to server-owned timestamps, with bounded enums and validation. Multiple attributes for the same frame merge under its real timestamp. Inclusive user endpoints and explicitly excluded bounds are distinguished.
- The UI retains nonzero fractional seconds on visual citations: the 27.25-second appearance and 27.75-second background sample are distinguishable in both streamed and saved answers. Transcript ranges keep their existing whole-second display.
- An oversized adaptive window returns a concrete split timestamp without consuming a focus inspection slot; both halves can be checked while the shared four-attempt and 48-frame caps remain enforced.
- Legacy caches stay readable; call/frame/size/time limits and deletion cleanup cover both formats. Shorter/subtle events and source gaps can still be missed.

## Artifacts and rollout

- [Baseline](results/2026-10-09/baseline.json)
- [Recommended primary run](results/2026-10-09/vision-only.json)
- [Recommended variation](results/2026-10-09/vision-only-variation.json)
- [Both models: primary](results/2026-10-09/vision-and-reasoning.json), [variation](results/2026-10-09/vision-and-reasoning-variation.json)
- [Machine-readable cost totals](results/2026-10-09/summary.json)

Implementation: PR #1052. Model permission alone was applied in PR #1051. The application/model switch has **not been deployed**. Proposed production settings change only VISION_MODEL to gpt-4.1-mini; LLM_MODEL remains gpt-4o-mini and VISUAL_REASONING_MODEL remains empty. Existing uploaded videos need visual-cache backfill after rollout; old caches remain usable until then.

Offline validation: 1,048 API unit tests; 23 Workers-runtime tests; Python suite 403 passed / 79 skipped without DB; 12 local-DB cleanup persistence tests; both documentation locale builds; API typecheck and generated binding check. After image numbering changed, all 52 affected API tests passed. CI for the final PR is the final merge gate.
