"""
Use case: Create a new video group.
"""

from app.domain.video.dto import CreateGroupParams
from app.domain.video.exceptions import InvalidGroupName as DomainInvalidGroupName
from app.domain.video.repositories import VideoGroupRepository
from app.domain.video.services import VideoGroupPolicy
from app.use_cases.video.dto import CreateGroupInput, VideoGroupListResponseDTO
from app.use_cases.video.exceptions import InvalidGroupInput
from app.use_cases.video.file_url import to_group_list_response_dto


class CreateVideoGroupUseCase:
    """Create a new video group for a user."""

    def __init__(self, group_repo: VideoGroupRepository):
        self.group_repo = group_repo

    def execute(self, user_id: int, input: CreateGroupInput) -> VideoGroupListResponseDTO:
        try:
            normalized_name = VideoGroupPolicy.normalize_name(input.name)
        except DomainInvalidGroupName as e:
            raise InvalidGroupInput(str(e)) from e

        params = CreateGroupParams(name=normalized_name, description=input.description)
        created = self.group_repo.create(user_id=user_id, params=params)
        return to_group_list_response_dto(created)
