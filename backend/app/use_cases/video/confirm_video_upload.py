"""
Use case: Confirm that a presigned-URL upload has completed.
Transitions the video from UPLOADING → PENDING and dispatches transcription.
"""

import logging

from app.domain.shared.transaction import TransactionPort
from app.domain.video.gateways import VideoTaskGateway
from app.domain.video.repositories import VideoRepository
from app.domain.video.status import VideoStatus
from app.use_cases.video.dto import VideoResponseDTO
from app.use_cases.video.exceptions import InvalidUploadState, ResourceNotFound
from app.use_cases.video.file_url import to_video_response_dto

logger = logging.getLogger(__name__)


class ConfirmVideoUploadUseCase:
    """
    Orchestrates upload confirmation:
    1. Fetch video, verify ownership
    2. Verify status is UPLOADING
    3. Transition UPLOADING → PENDING
    4. Dispatch transcription task
    5. Return VideoResponseDTO
    """

    def __init__(
        self,
        video_repo: VideoRepository,
        task_queue: VideoTaskGateway,
        tx: TransactionPort,
    ):
        self.video_repo = video_repo
        self.task_queue = task_queue
        self.tx = tx

    def execute(self, video_id: int, user_id: int) -> VideoResponseDTO:
        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")

        if video.status != VideoStatus.UPLOADING.value:
            raise InvalidUploadState(
                f"Video is in '{video.status}' state, expected 'uploading'"
            )

        with self.tx.atomic():
            self.video_repo.transition_status(
                video_id,
                from_status=VideoStatus.UPLOADING,
                to_status=VideoStatus.PENDING,
            )
            self.task_queue.enqueue_transcription(video_id)

        logger.info("Upload confirmed for video ID: %s, transcription enqueued", video_id)

        updated_video = self.video_repo.get_by_id(video_id, user_id)
        assert updated_video is not None
        return to_video_response_dto(updated_video)
