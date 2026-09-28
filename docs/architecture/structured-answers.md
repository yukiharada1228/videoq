---
title: Structured answer cutover and verification
description: Canonical answer storage, one-time history conversion, deployment order, and measured comparison.
---

# Structured answer cutover and verification

Issue [#996](https://github.com/yukiharada1228/videoq/issues/996) replaces citations embedded in prose with `segments: [{text, sourceIds}]` plus server-owned `sources`. See [the answer and SSE contract](prompt-engineering.md#structured-answers-citations-and-permissions). There is no compatibility mode or dual-write period.

## One-time history migration

Run the repository's `npm run db:migrate` entrypoint, which invokes `apps/api/scripts/migrate-database.ts` using `node --import tsx`. Node and development dependencies must be installed in the migration job. Do not run `drizzle-kit migrate` directly for this cutover: it cannot perform the intervening data conversion.

1. Generated migration `0024_add_structured_chat_response` adds nullable `response` JSONB.
2. A transaction takes an exclusive lock on `chat_logs`, reads batches of 250 records, and fills every missing response. A frozen converter under `scripts/migrations/structured-answer` converts valid old citation markers and preserves text, math, code, whitespace, unknown markers, source ordering and IDs. It is never imported by API or Web runtime code.
3. Generated migration `0025_retire_plain_chat_answer` first makes response non-null, then removes the old `answer` and `citations` columns. New installations run the same sequence with an empty conversion.

A session advisory lock serializes migration jobs. Re-running skips completed work; a conversion exception rolls back the data transaction while preserving the old columns and records. Malformed source JSON or source metadata stops migration instead of dropping that metadata. Investigate and correct those records from the backup before retrying; do not delete history to make migration succeed. Empty historical answers remain representable. Existing feedback, evaluation records, retrieved contexts, timestamps and chat IDs are unchanged.

The exclusive lock protects the conversion, but **does not replace stopping old writers** across the DDL stages. The converter's error and progress output does not include answer text or source metadata.

## Coordinated deployment

Use a maintenance window; rolling deployment of mixed versions is unsupported.

1. Back up the database and confirm a restore path. Record chat-log/evaluation counts and representative history IDs.
2. Block new chat requests and drain in-flight API requests. Stop old API instances so they cannot write after conversion. Pause new evaluation dispatch, drain running evaluation jobs, and stop old evaluation workers. Queued jobs may remain queued: their payload contains the chat-log ID, and the new worker reads the new response.
3. Run `npm ci` and, after stopping writers, `STRUCTURED_ANSWER_WRITERS_STOPPED=1 npm run db:migrate` against the intended database. Keep all chat writers and evaluation workers stopped until this command succeeds. The normal schema provenance checks remain `npm run db:check` and `npm run db:verify`.
4. Verify the row counts match; response is non-null on every record; old columns are absent; converted source IDs and destinations match sampled historical records. Do not print private answers in deployment logs.
5. Deploy the matching API, Web and Python evaluation worker together. Verify strict structured-output capability on the configured model/endpoint, authenticated and shared chat, history timestamps, CSV text, and one evaluation job.
6. Resume evaluation processing and open traffic only after every component uses the new contract.

If conversion fails, keep traffic paused and correct/retry; the old data remains. After the old columns have been removed, an old application binary cannot safely run against the database. Rollback requires restoring the pre-cutover database and matching old components, accounting for any subsequent writes.

An existing database with the old answer column refuses this cutover without that explicit acknowledgement. Fresh databases and already converted databases do not need it. For CD, set the `STRUCTURED_ANSWER_WRITERS_STOPPED` variable to `1` in the `production-app` environment only after step 2; remove it after completion. The workflow deploys API after migration, Web after API, and the evaluation worker after both. A blocked migration therefore prevents new application components from deploying. This acknowledgement does not stop services itself.

## Comparison protocol

The paid opt-in fixture test uses two fixed subtitle scenes (rotation and Python), fixed course metadata, the same configured model/endpoint and eight Japanese/English scenarios, three repeats each. Cases cover source-free guidance, course metadata, one/multiple sources, TeX and fenced code. Search results are fixed; retrieval ranking is not being evaluated.

```bash
STRUCTURED_ANSWER_LIVE=1 STRUCTURED_ANSWER_BROWSER=1 STRUCTURED_ANSWER_REPORT=/tmp/videoq-answer-structured.json npm run test:unit --workspace @videoq/api -- test/structured-answer.live.test.ts
```

The test reads API configuration from environment variables or `apps/api/.dev.vars`, without writing credentials into reports. Chromium must be installed. `STRUCTURED_ANSWER_CASE` optionally selects one fixture during investigation. Normal CI skips these calls.

Acceptance criteria fixed before comparison: no request or shape failures; all fixture facts correct; no missing or incorrect source links; no broken math/code or unnatural segment joins; per-mode median first visible text and completed rendering at most baseline × 1.25 + 250 ms. Record individual repeats, provider calls, repair calls, input/output tokens and source IDs. ID validity and whether a passage is actually supported are reviewed separately.

The browser harness uses the real API client, chat hook, event queue and message renderer. It measures from pressing Send to the first answer text and to completed character rendering, bracketing paint with two animation frames (approximately one-frame resolution). Search progress is excluded. The local SSE fixture feeds real model responses with fixed retrieval; auth, persistence and network distance to a production browser are excluded. Server first-text/final-response timing is also recorded separately. The harness is test-only and does not implement an application compatibility route.

## Recorded result: 2026-09-28

These measurements describe the cutover release, before generation-time streaming was enabled for course answers and the UI typing delay was removed. They are not measurements of those later changes.

Compared main commit `d07f0c94` with this implementation using `gpt-4o-mini` on the same configured endpoint. Each version completed 24 browser runs. The individual outputs, timings and provider-reported usage are in [the comparison data](https://github.com/yukiharada1228/videoq/blob/main/docs/verification/issue-996-comparison.json).

| Median per request | Course: previous → structured | No course: previous → structured |
|---|---:|---:|
| First visible answer text | 2,398 → 2,314 ms | 619 → 647 ms |
| Completed character rendering | 5,556 → 4,057 ms | 2,072 → 1,247 ms |
| Server first text | 2,344 → 2,266 ms | 558 → 594 ms |
| Server response complete | 2,345 → 2,266 ms | 899 → 803 ms |
| Model requests | 2 → 2 | 1 → 1 |
| Input tokens | 4,112 → 4,265.5 | 894.5 → 1,261.5 |
| Output tokens | 150 → 130 | 48 → 38 |

Both versions used the expected sources for all 18 cited passages, with no missing required citations. Manual review found the rotation formula/90-degree example, Python result and video count supported by the fixed evidence. Metadata and no-course answers had no scene links. The new version had zero invalid IDs, schema/request failures, repairs or KaTeX errors; all three code cases retained fenced code and all three multi-segment cases retained paragraph separation. All six no-course runs exposed text before model completion. Literal `a[1]` in plain prose remained literal even when source 1 existed.

The previous code question used metadata + search + answer (3 requests); the new version used search + answer (2). Across the set this was 45 → 42 requests, with zero repairs for either version. The total is reported separately from the median; no new call exists solely to convert prose into JSON.

Both timing gates passed. Faster completed rendering partly reflects shorter answers, especially no-course guidance, and is not evidence that structured output is inherently faster. No-course input usage increased about 41% due to the explicit output instructions/schema; this is a measured tradeoff. The fixture is small and does not establish general semantic citation accuracy.

Initial candidates omitted spaces between English segments and sometimes omitted requested code fences. Explicit whitespace and code examples in the output instructions resolved these in the final three repeats per case. The complete final run is recorded; development runs and a harness run interrupted by hot reload are not pooled into its timings. Browser hot reload is now disabled for measurement.
