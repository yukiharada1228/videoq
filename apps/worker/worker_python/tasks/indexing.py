"""index_video_transcript — VideoQ vector indexing task."""

from __future__ import annotations

import logging

from worker_python.contracts import JOB_BUILD_PLOG
from worker_python.db import db_connection
from worker_python.pipeline import vector_index
from worker_python.sqs_enqueue import enqueue_job
from worker_python.video_sql import get_video_for_task, transition_video_status
from worker_python.video_status import plan_indexing_failure, plan_indexing_success

logger = logging.getLogger(__name__)


class IndexingTargetMissingError(Exception):
    """Raised when the indexing target video does not exist or has no transcript."""


class IndexingExecutionFailedError(Exception):
    """Raised when vector indexing fails and retry is allowed."""


def index_video_transcript(video_id: int) -> None:
    """Index a video transcript and transition INDEXING → COMPLETED."""
    logger.info("Indexing task started for video ID: %d", video_id)

    with db_connection() as conn:
        video = get_video_for_task(conn, video_id)

    if video is None or not video.transcript:
        logger.warning(
            "Indexing target video not found or has no transcript: %d", video_id
        )
        raise IndexingTargetMissingError(
            f"Video {video_id} not found or has no transcript"
        )

    try:
        vector_index.index_video_transcript(video)
    except Exception as exc:
        raise IndexingExecutionFailedError(
            f"Vector indexing failed for video {video_id}: {exc}"
        ) from exc

    from_status, to_status = plan_indexing_success()
    with db_connection() as conn:
        updated = transition_video_status(conn, video_id, from_status, to_status)
        conn.commit()

    if not updated:
        logger.warning(
            "Video %d was not in %s status during indexing completion",
            video_id,
            from_status.value,
        )

    # ベクトル更新後に PLOG rebuild を best-effort で投入する。
    try:
        message_id = enqueue_job(JOB_BUILD_PLOG, {"video_id": video_id})
        if not message_id:
            from worker_python.tasks.build_plog import build_plog_artifacts

            build_plog_artifacts(video_id)
    except Exception:
        logger.exception("PLOG enqueue/build after indexing failed for video %d", video_id)

    logger.info("Successfully indexed video %d", video_id)


def mark_indexing_failed(video_id: int, reason: str = "") -> None:
    """Transition INDEXING → ERROR after retries are exhausted."""
    from_status, to_status = plan_indexing_failure()
    with db_connection() as conn:
        transition_video_status(
            conn, video_id, from_status, to_status, error_message=reason
        )
        conn.commit()
    logger.error(
        "Marked video %d as ERROR after indexing failure: %s", video_id, reason
    )
