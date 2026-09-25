"""index_video_transcript — VideoQ vector indexing task."""

from __future__ import annotations

import logging

from worker_python.advisory_locks import video_vector_write_lock
from worker_python.db import db_connection
from worker_python.pipeline import vector_index
from worker_python.video_sql import get_video_for_task, transition_video_status
from worker_python.video_status import VideoStatus, plan_indexing_success

logger = logging.getLogger(__name__)


class IndexingTargetMissingError(Exception):
    """Raised when the indexing target video does not exist or has no transcript."""


class IndexingExecutionFailedError(Exception):
    """Raised when vector indexing fails and retry is allowed."""


def index_video_transcript(video_id: int, *, job_id: str | None = None) -> None:
    """Index a video transcript and transition INDEXING → COMPLETED."""
    logger.info("Indexing task started for video ID: %d", video_id)

    with video_vector_write_lock(video_id):
        with db_connection() as conn:
            video = get_video_for_task(conn, video_id)

        if video is None or not video.transcript:
            logger.warning(
                "Indexing target video not found or has no transcript: %d", video_id
            )
            raise IndexingTargetMissingError(
                f"Video {video_id} not found or has no transcript"
            )

        if video.status == VideoStatus.INDEXING.value:
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
        elif video.status == VideoStatus.COMPLETED.value:
            logger.info("Video %d is already indexed", video_id)
        else:
            raise IndexingExecutionFailedError(
                f"Video {video_id} is not ready for indexing (status={video.status})"
            )

    logger.info("Successfully indexed video %d", video_id)
