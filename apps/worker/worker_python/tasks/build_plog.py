"""build_plog_artifacts — VideoQ PLOG offline pipeline."""

from __future__ import annotations

import logging
from typing import Any, Literal

from worker_python.db import db_connection
from worker_python.pipeline.plog_build import generate_plog_artifacts, save_plog_artifacts

logger = logging.getLogger(__name__)

PLOG_BUILD_LEASE_SECONDS = 15 * 60


def _claim_build_job(conn: Any, video_id: int) -> int | None:
    """Claim one pending job while the caller holds the video row lock."""
    conn.execute(
        """
        INSERT INTO plog_build_jobs
            (video_id, status, error_message, input_tokens, output_tokens,
             created_at, updated_at)
        VALUES (%s, 'pending', '', 0, 0, NOW(), NOW())
        ON CONFLICT (video_id) WHERE status IN ('pending', 'running')
        DO NOTHING
        """,
        (video_id,),
    )
    row = conn.execute(
        """
        UPDATE plog_build_jobs
           SET status = 'running', updated_at = NOW()
         WHERE id = (
               SELECT id
                 FROM plog_build_jobs
                WHERE video_id = %s
                  AND (
                    status = 'pending'
                    OR (
                      status = 'running'
                      AND updated_at < NOW() - (%s * INTERVAL '1 second')
                    )
                  )
                ORDER BY id DESC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
         )
        RETURNING id
        """,
        (video_id, PLOG_BUILD_LEASE_SECONDS),
    ).fetchone()
    return int(row["id"]) if row else None


def _finish_build_job(
    conn: Any,
    job_id: int,
    *,
    status: Literal["ready", "failed"],
    error_message: str = "",
) -> None:
    conn.execute(
        """
        UPDATE plog_build_jobs
           SET status = %s,
               error_message = %s,
               input_tokens = 0,
               output_tokens = 0,
               updated_at = NOW(),
               finished_at = NOW()
         WHERE id = %s
        """,
        (status, error_message, job_id),
    )


def build_plog_artifacts(video_id: int) -> None:
    """Build PLOG artifacts for a video; persists build job status via SQL."""
    logger.info("PLOG build started for video ID: %d", video_id)

    with db_connection() as conn:
        video = conn.execute(
            "SELECT transcript FROM videos WHERE id = %s FOR UPDATE", (video_id,)
        ).fetchone()
        if video is None or not video["transcript"]:
            raise ValueError(f"Video {video_id} missing or has no transcript")
        job_id = _claim_build_job(conn, video_id)
        conn.commit()
    if job_id is None:
        logger.info(
            "PLOG build already running for video %d; skipping duplicate", video_id
        )
        return

    try:
        artifacts = generate_plog_artifacts(video_id, video["transcript"])
        with db_connection() as conn:
            if artifacts is not None:
                save_plog_artifacts(conn, video_id, artifacts)
            _finish_build_job(conn, job_id, status="ready")
            conn.commit()
        logger.info("PLOG build finished for video %d", video_id)
    except Exception as exc:
        logger.exception("PLOG build failed for video %d", video_id)
        with db_connection() as conn:
            _finish_build_job(
                conn,
                job_id,
                status="failed",
                error_message=str(exc)[:2000],
            )
            conn.commit()
        raise
