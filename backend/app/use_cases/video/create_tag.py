"""
Use case: Create a new tag.
"""

from app.domain.video.entities import TagEntity
from app.domain.video.repositories import TagRepository


class CreateTagUseCase:
    """Create a new tag for a user."""

    def __init__(self, tag_repo: TagRepository):
        self.tag_repo = tag_repo

    def execute(self, user_id: int, validated_data: dict) -> TagEntity:
        return self.tag_repo.create(user_id=user_id, validated_data=validated_data)
