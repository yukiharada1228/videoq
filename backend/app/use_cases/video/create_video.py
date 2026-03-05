"""
Use case: Create a new video and dispatch transcription.
"""

import logging

from app.domain.auth.gateways import TaskQueueGateway
from app.domain.video.repositories import VideoRepository
from app.use_cases.video.exceptions import VideoLimitExceeded

logger = logging.getLogger(__name__)


class CreateVideoUseCase:
    """
    Orchestrates video creation:
    1. Enforce per-user video limit
    2. Persist the video record
    3. Dispatch transcription task after the transaction commits
    """

    def __init__(self, video_repo: VideoRepository, task_queue: TaskQueueGateway):
        self.video_repo = video_repo
        self.task_queue = task_queue

    def execute(self, user_id: int, video_limit, validated_data: dict):
        """
        Args:
            user_id: ID of the authenticated user.
            video_limit: Maximum number of videos the user may upload (None = unlimited).
            validated_data: Cleaned data from the serializer (without 'user' field).

        Returns:
            VideoEntity: The newly created video entity.

        Raises:
            VideoLimitExceeded: If the user has reached their upload limit.
        """
        if video_limit is not None:
            current_count = self.video_repo.count_for_user(user_id)
            if current_count >= video_limit:
                raise VideoLimitExceeded(video_limit)

        video = self.video_repo.create(user_id, validated_data)

        logger.info(f"Enqueueing transcription task for video ID: {video.id}")
        self.task_queue.enqueue_transcription(video.id)

        return video
