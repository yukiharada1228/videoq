"""
Use case: Update a video group.
"""

from app.domain.video.dto import UpdateGroupParams
from app.domain.video.repositories import VideoGroupRepository
from app.use_cases.video.dto import UpdateGroupInput, VideoGroupListResponseDTO
from app.use_cases.video.exceptions import ResourceNotFound
from app.use_cases.video.file_url import to_group_list_response_dto


class UpdateVideoGroupUseCase:
    """Update an existing video group."""

    def __init__(self, group_repo: VideoGroupRepository):
        self.group_repo = group_repo

    def execute(
        self, group_id: int, user_id: int, input: UpdateGroupInput
    ) -> VideoGroupListResponseDTO:
        """
        Raises:
            ResourceNotFound: If the group does not exist.
        """
        group = self.group_repo.get_by_id(group_id=group_id, user_id=user_id)
        if group is None:
            raise ResourceNotFound("Group")
        params = UpdateGroupParams(name=input.name, description=input.description)
        updated = self.group_repo.update(group=group, params=params)
        return to_group_list_response_dto(updated)
