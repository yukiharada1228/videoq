"""
Use case: Create a new video and dispatch transcription.
"""

import logging

from app.domain.shared.transaction import TransactionPort
from app.domain.user.repositories import UserRepository
from app.domain.video.dto import CreateVideoParams
from app.domain.video.gateways import VideoTaskGateway
from app.domain.video.repositories import VideoRepository
from app.use_cases.video.dto import CreateVideoInput, VideoResponseDTO
from app.use_cases.video.exceptions import FileSizeExceeded, ResourceNotFound
from app.use_cases.video.file_url import to_video_response_dto

logger = logging.getLogger(__name__)


class CreateVideoUseCase:
    """
    Orchestrates video creation:
    1. Enforce per-user video limit
    2. Persist the video record
    3. Dispatch transcription task after the transaction commits
    4. (Optional) Record storage usage for account limits
    """

    def __init__(
        self,
        user_repo: UserRepository,
        video_repo: VideoRepository,
        task_queue: VideoTaskGateway,
        tx: TransactionPort,
        storage_limit_check_use_case=None,
    ):
        self.user_repo = user_repo
        self.video_repo = video_repo
        self.task_queue = task_queue
        self.tx = tx
        self._storage_limit_check_use_case = storage_limit_check_use_case

    def execute(self, user_id: int, input: CreateVideoInput) -> VideoResponseDTO:
        """
        Args:
            user_id: ID of the authenticated user.
            input: Typed input DTO from the presentation layer.

        Returns:
            VideoResponseDTO: The newly created video.

        Raises:
            ResourceNotFound: If the target user does not exist.
        """
        user = self.user_repo.get_by_id(user_id)
        if user is None:
            raise ResourceNotFound("User")

        if input.file_size > 0:
            max_upload_bytes = user.get_max_upload_size_bytes()
            if input.file_size > max_upload_bytes:
                raise FileSizeExceeded(user.max_video_upload_size_mb)
            if self._storage_limit_check_use_case is not None:
                self._storage_limit_check_use_case.execute(user_id, input.file_size)

        with self.tx.atomic():
            params = CreateVideoParams(
                upload_file=input.file,
                title=input.title,
                description=input.description,
            )
            video = self.video_repo.create(user_id, params)

            logger.info(f"Enqueueing transcription task for video ID: {video.id}")
            self.task_queue.enqueue_transcription(video.id)

        return to_video_response_dto(video)
