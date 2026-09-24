"""Simplified PLOG artifact builder (LLM inventory + chain edges)."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from itertools import islice
from typing import Any

import psycopg

from worker_python.db import db_connection
from worker_python.env import env_str, heavy_pipeline_enabled
from worker_python.pipeline.embeddings import embed_texts
from worker_python.pipeline.embedding_schema import assert_embedding_schema
from worker_python.pipeline.embedding_contract import resolve_embedding_config
from worker_python.pipeline.srt import iter_srt_scenes

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PlogArtifacts:
    concepts: list[dict[str, Any]]
    embeddings: list[list[float]]


def generate_plog_artifacts(video_id: int, transcript: str) -> PlogArtifacts | None:
    """Generate outside the save transaction; None means the pipeline is disabled."""
    if not heavy_pipeline_enabled() and not env_str("OPENAI_API_KEY"):
        logger.info(
            "PLOG stub for video %d (no OPENAI_API_KEY / heavy pipeline)", video_id
        )
        return

    config = resolve_embedding_config()
    concepts = _extract_concepts(transcript)
    # An explicit empty inventory is a completed analysis, not a retryable error.
    # Still replace previous artifacts so a rebuild cannot leave a stale graph.
    if concepts:
        with db_connection() as conn:
            assert_embedding_schema(conn, config)
    embeddings = embed_texts([c["label"] for c in concepts]) if concepts else []
    return PlogArtifacts(concepts, embeddings)


def save_plog_artifacts(
    conn: psycopg.Connection[Any], video_id: int, artifacts: PlogArtifacts
) -> None:
    """Replace the graph in the caller's transaction, alongside the job status."""
    # Concept FKs cascade learner states and learning objects. Edges also have
    # their own video scope, which is independent of their endpoint FKs.
    conn.execute("DELETE FROM plog_edges WHERE video_id = %s", (video_id,))
    conn.execute("DELETE FROM plog_concepts WHERE video_id = %s", (video_id,))
    conn.execute("DELETE FROM plog_summary_nodes WHERE video_id = %s", (video_id,))

    concept_ids: list[int] = []
    for concept, emb in zip(artifacts.concepts, artifacts.embeddings, strict=True):
        row = conn.execute(
            """
            INSERT INTO plog_concepts
                (label, node_type, intro_sec, source_quote, embedding, created_at, video_id)
            VALUES (%s, %s, %s, %s, %s::jsonb, NOW(), %s)
            RETURNING id
            """,
            (
                concept["label"][:255],
                concept.get("node_type") or "concept",
                float(concept.get("intro_sec") or 0),
                str(concept.get("source_quote") or ""),
                json.dumps(emb),
                video_id,
            ),
        ).fetchone()
        cid = int(row["id"])
        concept_ids.append(cid)
        hints = concept.get("hints") or [f"Think about: {concept['label']}"]
        conn.execute(
            """
            INSERT INTO plog_learning_objects
                (opening_question, hint_ladder, misconceptions, canonical_order,
                 worked_examples, waypoints, created_at, concept_id)
            VALUES (%s, %s::jsonb, %s::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, NOW(), %s)
            """,
            (
                str(concept.get("opening_question") or f"What is {concept['label']}?"),
                json.dumps(hints, ensure_ascii=False),
                json.dumps(concept.get("misconceptions") or [], ensure_ascii=False),
                cid,
            ),
        )

    # Extraction order proposes a presentation path, not a semantic prerequisite.
    for src, tgt in zip(concept_ids, concept_ids[1:], strict=False):
        conn.execute(
            """
            INSERT INTO plog_edges
                (edge_type, quote, validation_status, created_at,
                 source_id, target_id, video_id)
            VALUES ('presentation_order', '', 'generated', NOW(), %s, %s, %s)
            """,
            (src, tgt, video_id),
        )

    logger.info(
        "PLOG built for video %d: %d concepts, %d edges",
        video_id,
        len(concept_ids),
        max(0, len(concept_ids) - 1),
    )


def _extract_concepts(transcript: str) -> list[dict[str, Any]]:
    from openai import OpenAI

    api_key = env_str("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for PLOG build")

    # Parse only the scenes included in the bounded prompt.
    scene_summaries = []
    for sc in islice(iter_srt_scenes(transcript), 40):
        scene_summaries.append(f"[{sc.start_time}-{sc.end_time}] {sc.text[:200]}")
    model = env_str("LLM_MODEL", "gpt-4o-mini")
    prompt = (
        "Extract up to 12 learning concepts from this transcript for a guided study graph.\n"
        "Only include concepts supported by the transcript. If it contains no learning "
        'concepts (for example, a recording test), return {"concepts":[]}. '
        "Do not invent concepts to fill the graph.\n"
        'Return JSON: {"concepts":[{"label":str,"intro_sec":number,"source_quote":str,'
        '"opening_question":str,"hints":[str],'
        '"misconceptions":[str]}]}\n'
        "Order hints from least to most revealing.\n"
        "intro_sec should be seconds from start. Use Japanese labels if the transcript is Japanese.\n\n"
        "Scenes:\n" + "\n".join(scene_summaries) + "\n\n"
        f"Transcript head:\n{transcript[:6000]}"
    )
    with OpenAI(api_key=api_key) as client:
        resp = client.chat.completions.create(
            model=model,
            temperature=0.2,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
    data = json.loads(resp.choices[0].message.content or "{}")
    if not isinstance(data, dict) or not isinstance(data.get("concepts"), list):
        raise ValueError("PLOG extraction must return a concepts array")
    concepts = data["concepts"]
    cleaned: list[dict[str, Any]] = []
    seen_labels: set[str] = set()
    for c in concepts:
        if (
            not isinstance(c, dict)
            or not isinstance(c.get("label"), str)
            or not c["label"].strip()
        ):
            raise ValueError("PLOG concept must have a non-empty string label")
        hints = c.get("hints")
        if hints is not None and (
            not isinstance(hints, list)
            or any(not isinstance(hint, str) for hint in hints)
        ):
            raise ValueError("PLOG hints must be an array of strings")
        label = c["label"].strip()[:255]
        if label not in seen_labels:
            # Keep the first occurrence's order and details; the database requires
            # one concept per stored label, and embeddings must use that label.
            seen_labels.add(label)
            cleaned.append({**c, "label": label})
    return cleaned
