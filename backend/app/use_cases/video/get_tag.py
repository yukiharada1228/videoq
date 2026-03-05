"""
Use case: Get tag details with its associated videos.
"""

from typing import Optional

from app.domain.video.entities import TagEntity
from app.domain.video.ports import FileUrlResolver
from app.domain.video.repositories import TagRepository
from app.use_cases.video.exceptions import ResourceNotFound
from app.use_cases.video.file_url import resolve_tag_video_file_urls


class GetTagDetailUseCase:
    """Retrieve a tag with its associated videos pre-loaded."""

    def __init__(
        self,
        tag_repo: TagRepository,
        file_url_resolver: Optional[FileUrlResolver] = None,
    ):
        self.tag_repo = tag_repo
        self.file_url_resolver = file_url_resolver

    def execute(self, tag_id: int, user_id: int) -> TagEntity:
        """
        Raises:
            ResourceNotFound: If the tag does not exist.
        """
        tag = self.tag_repo.get_with_videos(tag_id=tag_id, user_id=user_id)
        if tag is None:
            raise ResourceNotFound("Tag")
        resolve_tag_video_file_urls(tag, self.file_url_resolver)
        return tag
