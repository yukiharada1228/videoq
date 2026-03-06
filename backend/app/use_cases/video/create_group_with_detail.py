"""
Use case: Create a new video group and return detail DTO.
"""

from typing import Optional

from app.domain.video.dto import CreateGroupParams
from app.domain.video.ports import FileUrlResolver
from app.domain.video.repositories import VideoGroupRepository
from app.use_cases.video.dto import CreateGroupInput, VideoGroupDetailResponseDTO
from app.use_cases.video.exceptions import ResourceNotFound
from app.use_cases.video.file_url import to_group_detail_response_dto


class CreateVideoGroupWithDetailUseCase:
    """Create a video group and return its detail response."""

    def __init__(
        self,
        group_repo: VideoGroupRepository,
        file_url_resolver: Optional[FileUrlResolver] = None,
    ):
        self.group_repo = group_repo
        self.file_url_resolver = file_url_resolver

    def execute(self, user_id: int, input: CreateGroupInput) -> VideoGroupDetailResponseDTO:
        params = CreateGroupParams(name=input.name, description=input.description)
        group = self.group_repo.create(user_id=user_id, params=params)
        detail = self.group_repo.get_by_id(
            group_id=group.id, user_id=user_id, include_videos=True
        )
        if detail is None:
            raise ResourceNotFound("Group")
        return to_group_detail_response_dto(detail, self.file_url_resolver)
