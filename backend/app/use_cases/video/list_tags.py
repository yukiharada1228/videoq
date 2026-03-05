"""
Use case: List tags for a user.
"""

from typing import List

from app.domain.video.entities import TagEntity
from app.domain.video.repositories import TagRepository


class ListTagsUseCase:
    """Retrieve all tags for a user."""

    def __init__(self, tag_repo: TagRepository):
        self.tag_repo = tag_repo

    def execute(self, user_id: int) -> List[TagEntity]:
        return self.tag_repo.list_for_user(user_id=user_id)
