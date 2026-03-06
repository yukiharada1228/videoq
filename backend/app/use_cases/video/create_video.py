"""
Use case: Create a new video and dispatch transcription.
"""

import logging

from app.domain.user.repositories import UserRepository
from app.domain.video.dto import CreateVideoParams
from app.domain.video.entities import VideoEntity
from app.domain.video.exceptions import VideoLimitExceeded as DomainVideoLimitExceeded
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
    ):
        self.user_repo = user_repo
        self.video_repo = video_repo
        self.task_queue = task_queue

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
        video_limit: int | None = user.video_limit

        current_count = self.video_repo.count_for_user(user_id)
        try:
            VideoEntity.ensure_upload_within_limit(current_count, video_limit)
        except DomainVideoLimitExceeded as e:
            raise VideoLimitExceeded(e.limit) from e

        params = CreateVideoParams(
            file_name=input.file.name,
            file_bytes=input.file.read(),
            title=input.title,
            description=input.description,
        )
        video = self.video_repo.create(user_id, params)

        logger.info(f"Enqueueing transcription task for video ID: {video.id}")
        self.task_queue.enqueue_transcription(video.id)

        return to_video_response_dto(video)
