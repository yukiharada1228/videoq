"""
Use case: Update a video and sync PGVector metadata when the title changes.
"""

from django.db import transaction

from app.domain.video.repositories import VideoRepository
from app.models import Video
from app.use_cases.video.exceptions import ResourceNotFound


class UpdateVideoUseCase:
    """
    Orchestrates video update:
    1. Retrieve the video
    2. Apply changes
    3. Sync PGVector metadata if the title changed
    """

    def __init__(self, video_repo: VideoRepository):
        self.video_repo = video_repo

    @transaction.atomic
    def execute(self, video_id: int, user_id: int, validated_data: dict) -> Video:
        """
        Returns:
            Video: The updated Video instance.

        Raises:
            ResourceNotFound: If the video does not exist or is not owned by the user.
        """
        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")

        old_title = video.title
        video = self.video_repo.update(video, validated_data)

        if "title" in validated_data and old_title != video.title:
            self._sync_pgvector_title(video.id, video.title)

        return video

    @staticmethod
    def _sync_pgvector_title(video_id: int, new_title: str) -> None:
        from app.infrastructure.external.vector_store import update_video_title_in_vectors

        update_video_title_in_vectors(video_id, new_title)
