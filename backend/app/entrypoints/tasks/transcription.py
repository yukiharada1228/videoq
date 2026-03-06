"""
Video transcription task trigger.
Delegates all processing logic to RunTranscriptionUseCase.
"""

import logging

from celery import shared_task

from app.dependencies.tasks import get_run_transcription_use_case

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=3,
    name="app.presentation.tasks.transcription.transcribe_video",
)
def transcribe_video(self, video_id):
    """
    Trigger video transcription.
    Retry up to 3 times on failure (60s, 120s, 180s backoff).
    """
    logger.info("Transcription task started for video ID: %d", video_id)
    run_transcription_use_case = get_run_transcription_use_case()
    try:
        run_transcription_use_case.execute(video_id)
        logger.info("Successfully processed video %d", video_id)
    except Exception as e:
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=60 * (self.request.retries + 1))
        raise
