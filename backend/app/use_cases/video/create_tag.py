"""
Use case: Create a new tag.
"""

from app.domain.video.dto import CreateTagParams
from app.domain.video.entities import TagEntity
from app.domain.video.repositories import TagRepository
from app.use_cases.video.dto import CreateTagInput


class CreateTagUseCase:
    """Create a new tag for a user."""

    def __init__(self, tag_repo: TagRepository):
        self.tag_repo = tag_repo

    def execute(self, user_id: int, input: CreateTagInput) -> TagEntity:
        params = CreateTagParams(name=input.name, color=input.color)
        return self.tag_repo.create(user_id=user_id, params=params)
