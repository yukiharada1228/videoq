# PLOG in VideoQ

Prerequisite-aware Learning-Object Graph (PLOG) turns flat scene RAG into a guided learning map over lecture transcripts.

## Layers

- **L0**: Existing timestamped scene segments (`Video.transcript` + `videoq_scenes`)
- **L1**: RAPTOR-style hierarchical summaries (`PlogSummaryNode`)
- **L2**: Typed concept graph + learning objects (`PlogConcept`, `PlogEdge`, `PlogLearningObject`)

## Offline build

After indexing completes, Celery task `build_plog_artifacts` runs:

1. L1 hierarchy summarization
2. Stage 1 concept inventory (no relations)
3. Stage 2 typed edges + learning objects (citation-forced)
4. Deterministic checks only (paper §3.1):
   - (a) drop edges whose quote is absent from the transcript (normalized exact substring)
   - (b) intro timeline → retype ordering subtypes (backfill → `prerequisite_of`)
   - cycles are **not** auto-broken; human adjudication rejects/reorients

Rebuild: `POST /api/videos/{id}/plog/rebuild/`

## Edge curation (product choice vs paper §3.1)

The paper requires a human accept/reject pass before study. VideoQ drops that gate:
**existing** ordering edges are used as-is. Operators edit or delete mistakes (and merge
synonym / granularity twins) in the PLOG panel.

`PATCH /api/videos/{id}/plog/edges/{edge_id}/` with `{ "source_id", "target_id", "edge_type", "quote" }`.

`POST /api/videos/{id}/plog/concepts/{survivor_id}/merge/` with `{ "absorb_id": <id> }`.

Study mode is blocked (`PLOG_NOT_READY`) until at least one video graph has ordering edges
that form a DAG with a non-empty study path (cycles / empty path need edit or delete).

## Study mode runtime (Algorithm 1)

Chat request field `mode: "qa" | "study"` (default `qa`).

Per turn:

1. `RouteToConcept` — embedding retrieval only (no LLM)
2. Prerequisite frontier / unmet redirect
3. `Retrieve(L0, L1, t)` + learning object + withhold(Ahead)
4. Opening turn served **statically** (no LLM)
5. Else one generative nudge on the **large** model (`LLM_STUDY_MODEL`, default `gpt-4o`)
6. Next turn: `GradeReply` on the **small** model (`LLM_GRADE_MODEL`, default `gpt-4o-mini`); advance hint ladder or next topo concept

### Near-cost-neutral (§3.3)

1. L2 learning objects batch-built offline
2. Static system prefix = policy ∥ LO scaffold ∥ L0/L1 ctx ∥ withhold (stable for prompt cache); fresh = hint + last grade + latest learner turn only (no chat-history replay)
3. Retrieval routing + small-model grading; large model reserved for the single generative move
4. Opening turn static

## Learner progress

Study progress (reached concepts, hint rung, active concept) is kept only for the
browser study session (`study_session_id` → cache). It is not written to a durable
learner DB — Algorithm 1 carries this via dialogue-session state `H`.

## Metrics

See `backend/app/infrastructure/external/plog/metrics.py`:

- concept coverage, edge P/R/F1, direction agreement, inversion rate, DAG validity
- PVR, reveal proxy, scaffold features, analytical turn cost

## UI

- Chat panel: Q&A / Study toggle
- Video detail: PLOG panel (status, concepts, synonym merge, edge accept/reject, rebuild)
