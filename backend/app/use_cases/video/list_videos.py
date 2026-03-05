"""
Use case: List videos for a user with optional filters.
"""

from typing import List, Optional

from app.domain.video.entities import VideoEntity
from app.domain.video.ports import FileUrlResolver
from app.domain.video.repositories import VideoRepository
from app.use_cases.video.file_url import resolve_video_file_urls


class ListVideosUseCase:
    """Retrieve a filtered, ordered list of videos for a user."""

    def __init__(
        self,
        video_repo: VideoRepository,
        file_url_resolver: Optional[FileUrlResolver] = None,
    ):
        self.video_repo = video_repo
        self.file_url_resolver = file_url_resolver

    def execute(
        self,
        user_id: int,
        q: str = "",
        status: str = "",
        ordering: str = "",
        tag_ids: Optional[List[int]] = None,
    ) -> List[VideoEntity]:
        videos = self.video_repo.list_for_user(
            user_id=user_id,
            q=q,
            status=status,
            ordering=ordering,
            tag_ids=tag_ids,
        )
        resolve_video_file_urls(videos, self.file_url_resolver)
        return videos
