"""
Use case: Create a new video and dispatch transcription.
"""

import logging

from app.domain.shared.transaction import TransactionPort
from app.domain.user.exceptions import UserVideoLimitExceeded
from app.domain.user.repositories import UserRepository
from app.domain.video.dto import CreateVideoParams
from app.domain.video.gateways import VideoTaskGateway
from app.domain.video.repositories import VideoRepository
from app.use_cases.video.dto import CreateVideoInput, VideoResponseDTO
from app.use_cases.video.exceptions import ResourceNotFound, VideoLimitExceeded
from app.use_cases.video.file_url import to_video_response_dto

logger = logging.getLogger(__name__)


class CreateVideoUseCase:
    """
    Orchestrates video creation:
    1. Enforce per-user video limit
    2. Persist the video record
    3. Dispatch transcription task after the transaction commits
    """

    def __init__(
        self,
        user_repo: UserRepository,
        video_repo: VideoRepository,
        task_queue: VideoTaskGateway,
        tx: TransactionPort,
    ):
        self.user_repo = user_repo
        self.video_repo = video_repo
        self.task_queue = task_queue
        self.tx = tx

    def execute(self, user_id: int, input: CreateVideoInput) -> VideoResponseDTO:
        """
        Args:
            user_id: ID of the authenticated user.
            input: Typed input DTO from the presentation layer.

        Returns:
            VideoResponseDTO: The newly created video.

        Raises:
            ResourceNotFound: If the target user does not exist.
            VideoLimitExceeded: If the user has reached their upload limit.
        """
        user = self.user_repo.get_by_id(user_id)
        if user is None:
            raise ResourceNotFound("User")

        with self.tx.atomic():
            current_count = self.video_repo.count_for_user(user_id)
            try:
                user.assert_can_upload_video(current_count)
            except UserVideoLimitExceeded as e:
                raise VideoLimitExceeded(e.limit) from e

            params = CreateVideoParams(
                upload_file=input.file,
                title=input.title,
                description=input.description,
            )
            video = self.video_repo.create(user_id, params)

            logger.info(f"Enqueueing transcription task for video ID: {video.id}")
            self.task_queue.enqueue_transcription(video.id)

        return to_video_response_dto(video)
