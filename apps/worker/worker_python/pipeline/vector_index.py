"""PGVector indexing into videoq_scenes (no langchain runtime)."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

import psycopg

from worker_python.env import env_str
from worker_python.pipeline.embeddings import embed_texts, to_vector_literal
from worker_python.pipeline.srt import parse_srt_scenes
from worker_python.video_sql import VideoRow

logger = logging.getLogger(__name__)

ALLOWED_TABLES = frozenset({"videoq_scenes"})


def _table_name() -> str:
    name = env_str("PGVECTOR_COLLECTION_NAME", "videoq_scenes")
    if name not in ALLOWED_TABLES:
        raise ValueError(f"vector table '{name}' is not in the allowed list")
    return name


def delete_video_vectors(conn: psycopg.Connection[Any], video_id: int) -> int:
    table = _table_name()
    cur = conn.execute(f"DELETE FROM {table} WHERE video_id = %s", (video_id,))
    deleted = cur.rowcount or 0
    logger.info("Deleted %d vector rows for video %d", deleted, video_id)
    return deleted


def delete_all_vectors(conn: psycopg.Connection[Any]) -> int:
    table = _table_name()
    cur = conn.execute(f"DELETE FROM {table}")
    deleted = cur.rowcount or 0
    logger.info("Deleted %d vector rows (all)", deleted)
    return deleted


def index_video_transcript(
    conn: psycopg.Connection[Any],
    video: VideoRow,
) -> int:
    """Parse SRT scenes, embed, and insert into videoq_scenes. Returns inserted count."""
    if not video.transcript:
        raise ValueError(f"Video {video.id} has no transcript")

    scenes = parse_srt_scenes(video.transcript)
    if not scenes:
        logger.info("No SRT scenes for video %d; skipping vector index", video.id)
        return 0

    texts = [s.text for s in scenes]
    # Batch embeddings in chunks to avoid provider limits.
    embeddings: list[list[float]] = []
    batch_size = 64
    for i in range(0, len(texts), batch_size):
        embeddings.extend(embed_texts(texts[i : i + batch_size]))

    table = _table_name()
    delete_video_vectors(conn, video.id)

    inserted = 0
    for scene, emb in zip(scenes, embeddings, strict=True):
        meta = {
            "video_id": video.id,
            "user_id": video.user_id,
            "video_title": video.title,
            "start_time": scene.start_time,
            "end_time": scene.end_time,
            "start_sec": scene.start_sec,
            "end_sec": scene.end_sec,
            "scene_index": scene.index,
        }
        conn.execute(
            f"""
            INSERT INTO {table}
                (langchain_id, content, embedding, user_id, video_id, langchain_metadata)
            VALUES (%s, %s, %s::vector, %s, %s, %s::json)
            """,
            (
                str(uuid.uuid4()),
                scene.text,
                to_vector_literal(emb),
                video.user_id,
                video.id,
                json.dumps(meta, ensure_ascii=False),
            ),
        )
        inserted += 1

    logger.info("Indexed %d scenes for video %d into %s", inserted, video.id, table)
    return inserted
