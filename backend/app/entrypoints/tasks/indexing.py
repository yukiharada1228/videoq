"""
Vector indexing task trigger for a single video.
Delegates all processing logic to IndexVideoTranscriptUseCase.
"""

import logging

from celery import shared_task

from app.contracts.tasks import INDEX_VIDEO_TRANSCRIPT_TASK
from app.dependencies.tasks import (
    IndexingExecutionFailedError,
    IndexingTargetMissingError,
    index_video_transcript,
)

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=3,
    name=INDEX_VIDEO_TRANSCRIPT_TASK,
)
def index_video_transcript_task(self, video_id: int) -> None:
    """
    Trigger vector indexing for a single video.
    Retry up to 3 times on failure (60s, 120s, 180s backoff).
    """
    logger.info("Indexing task started for video ID: %d", video_id)
    try:
        index_video_transcript(video_id)
        logger.info("Successfully indexed video %d", video_id)
    except IndexingTargetMissingError:
        logger.warning("Indexing target video not found or has no transcript: %d", video_id)
        raise
    except IndexingExecutionFailedError as e:
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=60 * (self.request.retries + 1))
        raise
