"""
Use case: List tags for a user.
"""

from typing import List

from app.domain.video.repositories import TagRepository
from app.use_cases.video.dto import TagResponseDTO
from app.use_cases.video.file_url import to_tag_response_dtos


class ListTagsUseCase:
    """Retrieve all tags for a user."""

    def __init__(self, tag_repo: TagRepository):
        self.tag_repo = tag_repo

    def execute(self, user_id: int) -> List[TagResponseDTO]:
        tags = self.tag_repo.list_for_user(user_id=user_id)
        return to_tag_response_dtos(tags)
