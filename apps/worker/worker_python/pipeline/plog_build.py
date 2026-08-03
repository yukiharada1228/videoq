"""Simplified PLOG artifact builder (LLM inventory + chain edges)."""

from __future__ import annotations

import json
import logging
from typing import Any

import psycopg

from worker_python.env import env_str, heavy_pipeline_enabled
from worker_python.pipeline.embeddings import embed_texts
from worker_python.pipeline.srt import parse_srt_scenes

logger = logging.getLogger(__name__)


def run_plog_pipeline(conn: psycopg.Connection[Any], video_id: int, transcript: str) -> None:
    if not heavy_pipeline_enabled() and not env_str("OPENAI_API_KEY"):
        logger.info(
            "PLOG stub for video %d (no OPENAI_API_KEY / heavy pipeline)", video_id
        )
        return

    scenes = parse_srt_scenes(transcript)
    concepts = _extract_concepts(transcript, scenes)
    if not concepts:
        raise RuntimeError("PLOG extraction produced no concepts")

    embeddings = embed_texts([c["label"] for c in concepts])

    # Clear previous artifacts for this video (order matters for FKs).
    conn.execute(
        """
        DELETE FROM learner_concept_states
         WHERE concept_id IN (SELECT id FROM plog_concepts WHERE video_id = %s)
        """,
        (video_id,),
    )
    conn.execute(
        """
        DELETE FROM plog_learning_objects
         WHERE concept_id IN (SELECT id FROM plog_concepts WHERE video_id = %s)
        """,
        (video_id,),
    )
    conn.execute("DELETE FROM plog_edges WHERE video_id = %s", (video_id,))
    conn.execute("DELETE FROM plog_concepts WHERE video_id = %s", (video_id,))
    conn.execute("DELETE FROM plog_summary_nodes WHERE video_id = %s", (video_id,))

    concept_ids: list[int] = []
    for concept, emb in zip(concepts, embeddings, strict=True):
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
        hints = concept.get("hints") or [
            {"text": f"Think about: {concept['label']}", "level": 1}
        ]
        conn.execute(
            """
            INSERT INTO plog_learning_objects
                (opening_question, hint_ladder, misconceptions, canonical_order,
                 worked_examples, waypoints, created_at, concept_id)
            VALUES (%s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, NOW(), %s)
            """,
            (
                str(concept.get("opening_question") or f"What is {concept['label']}?"),
                json.dumps(hints, ensure_ascii=False),
                json.dumps(concept.get("misconceptions") or [], ensure_ascii=False),
                json.dumps([], ensure_ascii=False),
                json.dumps([], ensure_ascii=False),
                json.dumps([], ensure_ascii=False),
                cid,
            ),
        )

    # Chain prerequisite_of edges so study mode has an ordering path.
    for src, tgt in zip(concept_ids, concept_ids[1:], strict=False):
        conn.execute(
            """
            INSERT INTO plog_edges
                (edge_type, quote, validation_status, created_at,
                 source_id, target_id, video_id)
            VALUES ('prerequisite_of', '', 'accepted', NOW(), %s, %s, %s)
            """,
            (src, tgt, video_id),
        )

    logger.info(
        "PLOG built for video %d: %d concepts, %d edges",
        video_id,
        len(concept_ids),
        max(0, len(concept_ids) - 1),
    )


def _extract_concepts(transcript: str, scenes: list) -> list[dict[str, Any]]:
    from openai import OpenAI

    api_key = env_str("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is required for PLOG build")

    # Keep prompt size bounded.
    scene_summaries = []
    for sc in scenes[:40]:
        scene_summaries.append(
            f"[{sc.start_time}-{sc.end_time}] {sc.text[:200]}"
        )
    client = OpenAI(api_key=api_key)
    model = env_str("LLM_MODEL", "gpt-4o-mini")
    prompt = (
        "Extract 3-12 learning concepts from this lecture transcript for a guided study graph.\n"
        "Return JSON: {\"concepts\":[{\"label\":str,\"intro_sec\":number,\"source_quote\":str,"
        "\"opening_question\":str,\"hints\":[{\"text\":str,\"level\":number}],"
        "\"misconceptions\":[str]}]}\n"
        "intro_sec should be seconds from start. Use Japanese labels if the transcript is Japanese.\n\n"
        f"Scenes:\n" + "\n".join(scene_summaries) + "\n\n"
        f"Transcript head:\n{transcript[:6000]}"
    )
    resp = client.chat.completions.create(
        model=model,
        temperature=0.2,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    data = json.loads(resp.choices[0].message.content or "{}")
    concepts = data.get("concepts") or []
    if not isinstance(concepts, list):
        return []
    cleaned: list[dict[str, Any]] = []
    for c in concepts:
        if not isinstance(c, dict) or not c.get("label"):
            continue
        cleaned.append(c)
    return cleaned
