"""build_plog_artifacts — PLOG offline pipeline without Django."""

from __future__ import annotations

import logging
import os
from typing import Any

from worker_python.db import db_connection
from worker_python.video_sql import get_video_for_task

logger = logging.getLogger(__name__)

_HEAVY_PIPELINE = os.environ.get("ENABLE_HEAVY_PIPELINE", "").lower() in {
    "1",
    "true",
    "yes",
}


def _get_latest_build_job(conn: Any, video_id: int) -> dict[str, Any] | None:
    return conn.execute(
        """
        SELECT id, status
          FROM app_plogbuildjob
         WHERE video_id = %s
         ORDER BY id DESC
         LIMIT 1
        """,
        (video_id,),
    ).fetchone()


def _create_build_job(conn: Any, video_id: int) -> int:
    row = conn.execute(
        """
        INSERT INTO app_plogbuildjob
            (video_id, status, error_message, input_tokens, output_tokens,
             created_at, updated_at)
        VALUES (%s, 'pending', '', 0, 0, NOW(), NOW())
        RETURNING id
        """,
        (video_id,),
    ).fetchone()
    return int(row["id"])


def _update_build_job(
    conn: Any,
    job_id: int,
    *,
    status: str,
    error_message: str = "",
    input_tokens: int = 0,
    output_tokens: int = 0,
    finished: bool = False,
) -> None:
    if finished:
        conn.execute(
            """
            UPDATE app_plogbuildjob
               SET status = %s,
                   error_message = %s,
                   input_tokens = %s,
                   output_tokens = %s,
                   updated_at = NOW(),
                   finished_at = NOW()
             WHERE id = %s
            """,
            (status, error_message, input_tokens, output_tokens, job_id),
        )
    else:
        conn.execute(
            """
            UPDATE app_plogbuildjob
               SET status = %s,
                   error_message = %s,
                   input_tokens = %s,
                   output_tokens = %s,
                   updated_at = NOW()
             WHERE id = %s
            """,
            (status, error_message, input_tokens, output_tokens, job_id),
        )


def _run_plog_pipeline(video_id: int, transcript: str) -> None:
    """
    TODO: copy/adapt BuildPlogArtifactsUseCase helpers (LLM concept extraction, etc.).
    """
    if not _HEAVY_PIPELINE:
        logger.info(
            "ENABLE_HEAVY_PIPELINE is off; PLOG build stub for video %d (transcript_len=%d)",
            video_id,
            len(transcript),
        )
        return

    raise NotImplementedError(
        "PLOG artifact build requires LLM/embedding deps "
        "(set ENABLE_HEAVY_PIPELINE=1 after packaging)."
    )


def build_plog_artifacts(video_id: int) -> None:
    """Build PLOG artifacts for a video; persists build job status via SQL."""
    logger.info("PLOG build started for video ID: %d", video_id)

    with db_connection() as conn:
        video = get_video_for_task(conn, video_id)

    if video is None or not video.transcript:
        raise ValueError(f"Video {video_id} missing or has no transcript")

    with db_connection() as conn:
        latest = _get_latest_build_job(conn, video_id)
        if latest and latest["status"] in {"pending", "running"}:
            job_id = int(latest["id"])
            _update_build_job(conn, job_id, status="running")
        else:
            job_id = _create_build_job(conn, video_id)
            _update_build_job(conn, job_id, status="running")
        conn.commit()

    try:
        _run_plog_pipeline(video_id, video.transcript)
        with db_connection() as conn:
            _update_build_job(conn, job_id, status="ready", finished=True)
            conn.commit()
        logger.info("PLOG build finished for video %d", video_id)
    except Exception as exc:
        logger.exception("PLOG build failed for video %d", video_id)
        with db_connection() as conn:
            _update_build_job(
                conn,
                job_id,
                status="failed",
                error_message=str(exc)[:2000],
                finished=True,
            )
            conn.commit()
        raise
