"""
Use case: Update a video group.
"""

from app.domain.video.entities import VideoGroupEntity
from app.domain.video.repositories import VideoGroupRepository
from app.use_cases.video.exceptions import ResourceNotFound


class UpdateVideoGroupUseCase:
    """Update an existing video group."""

    def __init__(self, group_repo: VideoGroupRepository):
        self.group_repo = group_repo

    def execute(
        self, group_id: int, user_id: int, validated_data: dict
    ) -> VideoGroupEntity:
        """
        Raises:
            ResourceNotFound: If the group does not exist.
        """
        group = self.group_repo.get_by_id(group_id=group_id, user_id=user_id)
        if group is None:
            raise ResourceNotFound("Group")
        return self.group_repo.update(group=group, validated_data=validated_data)
