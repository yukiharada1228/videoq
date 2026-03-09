"""
Use case: Create a new video group and return detail DTO.
"""

from app.domain.video.dto import CreateGroupParams
from app.domain.video.exceptions import InvalidGroupName as DomainInvalidGroupName
from app.domain.video.repositories import VideoGroupRepository
from app.domain.video.services import VideoGroupPolicy
from app.use_cases.video.dto import CreateGroupInput, VideoGroupDetailResponseDTO
from app.use_cases.video.exceptions import InvalidGroupInput, ResourceNotFound
from app.use_cases.video.file_url import to_group_detail_response_dto


class CreateVideoGroupWithDetailUseCase:
    """Create a video group and return its detail response."""

    def __init__(
        self,
        group_repo: VideoGroupRepository,
    ):
        self.group_repo = group_repo

    def execute(self, user_id: int, input: CreateGroupInput) -> VideoGroupDetailResponseDTO:
        try:
            normalized_name = VideoGroupPolicy.normalize_name(input.name)
        except DomainInvalidGroupName as e:
            raise InvalidGroupInput(str(e)) from e

        params = CreateGroupParams(name=normalized_name, description=input.description)
        group = self.group_repo.create(user_id=user_id, params=params)
        detail = self.group_repo.get_by_id(
            group_id=group.id, user_id=user_id, include_videos=True
        )
        if detail is None:
            raise ResourceNotFound("Video group")
        return to_group_detail_response_dto(detail)
