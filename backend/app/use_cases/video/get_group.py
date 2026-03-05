"""
Use cases: Get a video group (owner or shared access).
"""

from typing import Optional

from app.domain.video.entities import VideoGroupEntity
from app.domain.video.repositories import VideoGroupRepository
from app.use_cases.video.exceptions import ResourceNotFound


class GetVideoGroupUseCase:
    """Retrieve a group by ID for its owner."""

    def __init__(self, group_repo: VideoGroupRepository):
        self.group_repo = group_repo

    def execute(
        self, group_id: int, user_id: int, include_videos: bool = False
    ) -> VideoGroupEntity:
        """
        Raises:
            ResourceNotFound: If the group does not exist.
        """
        group = self.group_repo.get_by_id(
            group_id=group_id, user_id=user_id, include_videos=include_videos
        )
        if group is None:
            raise ResourceNotFound("Group")
        return group


class GetSharedGroupUseCase:
    """Retrieve a group by share token."""

    def __init__(self, group_repo: VideoGroupRepository):
        self.group_repo = group_repo

    def execute(self, share_token: str) -> VideoGroupEntity:
        """
        Raises:
            ResourceNotFound: If the share token is invalid.
        """
        group = self.group_repo.get_by_share_token(share_token=share_token)
        if group is None:
            raise ResourceNotFound("Group")
        return group
