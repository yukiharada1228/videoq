"""
Use case: List videos for a user with optional filters.
"""

from typing import List, Optional

from app.domain.video.dto import VideoListQuery
from app.domain.video.ports import FileUrlResolver
from app.domain.video.repositories import VideoRepository
from app.use_cases.video.dto import VideoResponseDTO
from app.use_cases.video.file_url import to_video_response_dtos


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
    ) -> List[VideoResponseDTO]:
        query = VideoListQuery(q=q, status=status, ordering=ordering, tag_ids=tag_ids)
        videos = self.video_repo.list_for_user(user_id=user_id, query=query)
        return to_video_response_dtos(videos, self.file_url_resolver)
