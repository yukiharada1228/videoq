"""Shared SQL helpers for video rows."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import psycopg

from worker_python.video_status import VideoStatus

logger = logging.getLogger(__name__)


@dataclass
class VideoRow:
    id: int
    user_id: str
    title: str
    transcript: str | None
    status: str
    source_type: str
    file_key: str | None
    youtube_video_id: str | None
    error_message: str
    processing_seconds: int = 0


@dataclass(frozen=True)
class ProcessingReservationResult:
    allowed: bool
    already_reserved: bool = False
    limit_seconds: int | None = None


def _row_to_video(row: dict[str, Any]) -> VideoRow:
    file_val = row.get("file")
    return VideoRow(
        id=int(row["id"]),
        # users.id is a UUID text PK (migration 0006); int() would raise ValueError.
        user_id=str(row["user_id"]),
        title=row["title"],
        transcript=row.get("transcript") or None,
        status=row["status"],
        source_type=row.get("source_type") or "uploaded",
        file_key=file_val if file_val else None,
        youtube_video_id=row.get("youtube_video_id") or None,
        error_message=row.get("error_message") or "",
        processing_seconds=int(row.get("processing_seconds") or 0),
    )


def get_video_for_task(conn: psycopg.Connection[Any], video_id: int) -> VideoRow | None:
    row = conn.execute(
        """
        SELECT id, user_id, title, transcript, status, source_type,
               file, youtube_video_id, error_message, processing_seconds
          FROM videos
         WHERE id = %s
        """,
        (video_id,),
    ).fetchone()
    return _row_to_video(row) if row else None


def reserve_processing_seconds(
    conn: psycopg.Connection[Any], video_id: int, seconds: int
) -> ProcessingReservationResult:
    """Reserve monthly processing usage once per video under one row lock."""
    if seconds <= 0:
        raise ValueError("processing seconds must be positive")

    video = conn.execute(
        """
        SELECT user_id, processing_seconds
          FROM videos
         WHERE id = %s
         FOR UPDATE
        """,
        (video_id,),
    ).fetchone()
    if video is None:
        raise ValueError(f"Video {video_id} not found")
    if int(video.get("processing_seconds") or 0) > 0:
        return ProcessingReservationResult(allowed=True, already_reserved=True)

    user_id = str(video["user_id"])
    reserved = conn.execute(
        """
        UPDATE users
           SET used_processing_seconds = CASE
                 WHEN usage_period_start IS NULL
                   OR date_trunc('month', usage_period_start, 'UTC')
                      <> date_trunc('month', now(), 'UTC')
                 THEN %s
                 ELSE used_processing_seconds + %s
               END,
               used_ai_answers = CASE
                 WHEN usage_period_start IS NULL
                   OR date_trunc('month', usage_period_start, 'UTC')
                      <> date_trunc('month', now(), 'UTC')
                 THEN 0
                 ELSE used_ai_answers
               END,
               usage_period_start = CASE
                 WHEN usage_period_start IS NULL
                   OR date_trunc('month', usage_period_start, 'UTC')
                      <> date_trunc('month', now(), 'UTC')
                 THEN now()
                 ELSE usage_period_start
               END
         WHERE id = %s
           AND is_over_quota IS NOT TRUE
           AND (
             processing_limit_minutes IS NULL
             OR CASE
                  WHEN usage_period_start IS NULL
                    OR date_trunc('month', usage_period_start, 'UTC')
                       <> date_trunc('month', now(), 'UTC')
                  THEN 0
                  ELSE used_processing_seconds
                END + %s <= processing_limit_minutes * 60
           )
        RETURNING used_processing_seconds
        """,
        (seconds, seconds, user_id, seconds),
    ).fetchone()
    if reserved is None:
        state = conn.execute(
            """
            SELECT processing_limit_minutes, is_over_quota
              FROM users
             WHERE id = %s
            """,
            (user_id,),
        ).fetchone()
        limit = None if state is None else state.get("processing_limit_minutes")
        return ProcessingReservationResult(
            allowed=False,
            limit_seconds=None if limit is None else int(limit) * 60,
        )

    conn.execute(
        "UPDATE videos SET processing_seconds = %s WHERE id = %s",
        (seconds, video_id),
    )
    return ProcessingReservationResult(allowed=True)


def transition_video_status(
    conn: psycopg.Connection[Any],
    video_id: int,
    from_status: VideoStatus | str,
    to_status: VideoStatus | str,
    *,
    error_message: str = "",
) -> bool:
    from_val = from_status.value if isinstance(from_status, VideoStatus) else from_status
    to_val = to_status.value if isinstance(to_status, VideoStatus) else to_status
    cur = conn.execute(
        """
        UPDATE videos
           SET status = %s,
               error_message = %s
         WHERE id = %s AND status = %s
        """,
        (to_val, error_message, video_id, from_val),
    )
    return cur.rowcount > 0


def save_transcript(conn: psycopg.Connection[Any], video_id: int, transcript: str) -> None:
    conn.execute(
        "UPDATE videos SET transcript = %s WHERE id = %s",
        (transcript, video_id),
    )


def list_completed_videos_with_transcript(
    conn: psycopg.Connection[Any],
) -> list[VideoRow]:
    rows = conn.execute(
        """
        SELECT id, user_id, title, transcript, status, source_type,
               file, youtube_video_id, error_message
          FROM videos
         WHERE status = %s
           AND transcript IS NOT NULL
           AND transcript <> ''
         ORDER BY id
        """,
        (VideoStatus.COMPLETED.value,),
    ).fetchall()
    return [_row_to_video(r) for r in rows]


def delete_video_cascade(
    conn: psycopg.Connection[Any], video_id: int, user_id: str
) -> None:
    """
    Hard-delete a video and related rows from the modern VideoQ schema.
    The schema has no ON DELETE CASCADE, so dependencies are removed explicitly.
    """
    conn.execute("SELECT 1 FROM videos WHERE id = %s FOR UPDATE", (video_id,))

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
    conn.execute("DELETE FROM plog_build_jobs WHERE video_id = %s", (video_id,))
    conn.execute("DELETE FROM video_tags WHERE video_id = %s", (video_id,))
    conn.execute("DELETE FROM video_group_members WHERE video_id = %s", (video_id,))
    conn.execute(
        "DELETE FROM videos WHERE id = %s AND user_id = %s",
        (video_id, user_id),
    )
    logger.info("Deleted video %d (user %s) and related rows", video_id, user_id)
