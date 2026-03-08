"""
Use case: Update a video group and return detail DTO.
"""

from app.domain.video.dto import UpdateGroupParams
from app.domain.video.repositories import VideoGroupRepository
from app.use_cases.video.dto import UpdateGroupInput, VideoGroupDetailResponseDTO
from app.use_cases.video.exceptions import ResourceNotFound
from app.use_cases.video.file_url import to_group_detail_response_dto


class UpdateVideoGroupWithDetailUseCase:
    """Update a video group and return its detail response."""

    def __init__(
        self,
        group_repo: VideoGroupRepository,
    ):
        self.group_repo = group_repo

    def execute(
        self, group_id: int, user_id: int, input: UpdateGroupInput
    ) -> VideoGroupDetailResponseDTO:
        group = self.group_repo.get_by_id(group_id=group_id, user_id=user_id)
        if group is None:
            raise ResourceNotFound("Group")

        params = UpdateGroupParams(name=input.name, description=input.description)
        self.group_repo.update(group=group, params=params)

        detail = self.group_repo.get_by_id(
            group_id=group_id, user_id=user_id, include_videos=True
        )
        if detail is None:
            raise ResourceNotFound("Group")
        return to_group_detail_response_dto(detail)
