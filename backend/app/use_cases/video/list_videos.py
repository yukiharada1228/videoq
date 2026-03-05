"""
Use case: List videos for a user with optional filters.
"""

from typing import List, Optional

from app.domain.video.entities import VideoEntity
from app.domain.video.repositories import VideoRepository


class ListVideosUseCase:
    """Retrieve a filtered, ordered list of videos for a user."""

    def __init__(self, video_repo: VideoRepository):
        self.video_repo = video_repo

    def execute(
        self,
        user_id: int,
        q: str = "",
        status: str = "",
        ordering: str = "",
        tag_ids: Optional[List[int]] = None,
    ) -> List[VideoEntity]:
        return self.video_repo.list_for_user(
            user_id=user_id,
            q=q,
            status=status,
            ordering=ordering,
            tag_ids=tag_ids,
        )
