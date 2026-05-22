"""
Celery task: reindex a single video's transcript after a manual edit.
Delegates all processing to ReindexVideoTranscriptUseCase.
"""

import logging

from celery import shared_task

from app.contracts.tasks import REINDEX_VIDEO_TRANSCRIPT_TASK
from app.dependencies.tasks import reindex_video_transcript

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=3,
    name=REINDEX_VIDEO_TRANSCRIPT_TASK,
)
def reindex_video_transcript_task(self, video_id: int) -> None:
    """
    Reindex vectors for a single video after a manual transcript edit.
    Retry up to 3 times on failure (60s, 120s, 180s backoff).
    """
    logger.info("Reindex transcript task started for video ID: %d", video_id)
    try:
        reindex_video_transcript(video_id)
        logger.info("Successfully reindexed transcript for video %d", video_id)
    except Exception as exc:
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))
        logger.error(
            "Reindex transcript exhausted all retries for video %d", video_id, exc_info=True
        )
        raise
