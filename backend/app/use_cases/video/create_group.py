"""
Use case: Create a new video group.
"""

from app.domain.video.dto import CreateGroupParams
from app.domain.video.entities import VideoGroupEntity
from app.domain.video.repositories import VideoGroupRepository
from app.use_cases.video.dto import CreateGroupInput


class CreateVideoGroupUseCase:
    """Create a new video group for a user."""

    def __init__(self, group_repo: VideoGroupRepository):
        self.group_repo = group_repo

    def execute(self, user_id: int, input: CreateGroupInput) -> VideoGroupEntity:
        params = CreateGroupParams(name=input.name, description=input.description)
        return self.group_repo.create(user_id=user_id, params=params)
