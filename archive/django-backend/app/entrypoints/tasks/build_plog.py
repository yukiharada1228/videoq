"""Celery task: build PLOG artifacts for a video."""

import logging

from celery import shared_task

from app.contracts.tasks import BUILD_PLOG_TASK
from app.dependencies.tasks import build_plog_artifacts

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=2,
    name=BUILD_PLOG_TASK,
)
def build_plog_artifacts_task(self, video_id: int) -> None:
    logger.info("PLOG build started for video ID: %d", video_id)
    try:
        build_plog_artifacts(video_id)
        logger.info("PLOG build finished for video %d", video_id)
    except Exception as e:
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=120 * (self.request.retries + 1))
        logger.error("PLOG build exhausted retries for video %d: %s", video_id, e)
        raise
