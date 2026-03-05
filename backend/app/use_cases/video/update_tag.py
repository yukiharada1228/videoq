"""
Use case: Update a tag.
"""

from app.domain.video.entities import TagEntity
from app.domain.video.repositories import TagRepository
from app.use_cases.video.exceptions import ResourceNotFound


class UpdateTagUseCase:
    """Update an existing tag."""

    def __init__(self, tag_repo: TagRepository):
        self.tag_repo = tag_repo

    def execute(self, tag_id: int, user_id: int, validated_data: dict) -> TagEntity:
        """
        Raises:
            ResourceNotFound: If the tag does not exist.
        """
        tag = self.tag_repo.get_by_id(tag_id=tag_id, user_id=user_id)
        if tag is None:
            raise ResourceNotFound("Tag")
        return self.tag_repo.update(tag=tag, validated_data=validated_data)
