"""
Use case: Transcribe a video and index its scenes for RAG search.
"""

import logging

from django.db import transaction

from app.domain.video.gateways import TranscriptionGateway, VideoTaskGateway
from app.domain.video.repositories import VideoTranscriptionRepository
from app.domain.video.status import VideoStatus
from app.use_cases.video.exceptions import (
    TranscriptionExecutionFailed,
    TranscriptionTargetMissing,
)

logger = logging.getLogger(__name__)


class RunTranscriptionUseCase:
    """
    Orchestrates video transcription:
    1. Validate video exists and is ready for processing
    2. Transition status PENDING/ERROR → PROCESSING
    3. Run transcription (audio extraction + Whisper + scene splitting)
    4. Persist transcript and transition status PROCESSING → INDEXING
    5. Enqueue async indexing task (INDEXING → COMPLETED handled by IndexVideoTranscriptUseCase)
    On error: transition status PROCESSING → ERROR and re-raise.
    """

    def __init__(
        self,
        video_repo: VideoTranscriptionRepository,
        transcription_gateway: TranscriptionGateway,
        task_queue: VideoTaskGateway,
    ):
        self.video_repo = video_repo
        self.transcription_gateway = transcription_gateway
        self.task_queue = task_queue

    def execute(self, video_id: int) -> None:
        video = self.video_repo.get_by_id_for_task(video_id)
        if video is None:
            raise TranscriptionTargetMissing(video_id)

        current_status = VideoStatus.from_value(video.status)
        current_status.assert_transition_to(VideoStatus.PROCESSING)

        logger.info("Transcription started for video %d (%s)", video.id, video.title)
        self.video_repo.transition_status(
            video_id=video_id,
            from_status=current_status,
            to_status=VideoStatus.PROCESSING,
        )

        try:
            transcript = self.transcription_gateway.run(video_id)
            with transaction.atomic():
                self.video_repo.save_transcript(video_id, transcript)
                VideoStatus.PROCESSING.assert_transition_to(VideoStatus.INDEXING)
                self.video_repo.transition_status(
                    video_id=video_id,
                    from_status=VideoStatus.PROCESSING,
                    to_status=VideoStatus.INDEXING,
                )
                self.task_queue.enqueue_indexing(video_id)
        except Exception as e:
            error_msg = str(e)
            logger.error("Transcription failed for video %d: %s", video_id, error_msg)
            VideoStatus.PROCESSING.assert_transition_to(VideoStatus.ERROR)
            self.video_repo.transition_status(
                video_id=video_id,
                from_status=VideoStatus.PROCESSING,
                to_status=VideoStatus.ERROR,
                error_message=error_msg,
            )
            raise TranscriptionExecutionFailed(video_id=video_id, reason=error_msg) from e

        logger.info("Transcription completed for video %d; indexing task enqueued", video_id)
