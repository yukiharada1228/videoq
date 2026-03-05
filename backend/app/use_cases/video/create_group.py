"""
Use case: Create a new video group.
"""

from app.domain.video.entities import VideoGroupEntity
from app.domain.video.repositories import VideoGroupRepository


class CreateVideoGroupUseCase:
    """Create a new video group for a user."""

    def __init__(self, group_repo: VideoGroupRepository):
        self.group_repo = group_repo

    def execute(self, user_id: int, validated_data: dict) -> VideoGroupEntity:
        return self.group_repo.create(user_id=user_id, validated_data=validated_data)
