"""
Use cases: Get a video group (owner or shared access).
"""

from app.domain.video.repositories import VideoGroupRepository
from app.use_cases.video.dto import VideoGroupDetailResponseDTO
from app.use_cases.video.exceptions import ResourceNotFound
from app.use_cases.video.file_url import to_group_detail_response_dto


class GetVideoGroupUseCase:
    """Retrieve a group by ID for its owner."""

    def __init__(
        self,
        group_repo: VideoGroupRepository,
    ):
        self.group_repo = group_repo

    def execute(
        self, group_id: int, user_id: int, include_videos: bool = False
    ) -> VideoGroupDetailResponseDTO:
        """
        Raises:
            ResourceNotFound: If the group does not exist.
        """
        group = self.group_repo.get_by_id(
            group_id=group_id, user_id=user_id, include_videos=include_videos
        )
        if group is None:
            raise ResourceNotFound("Group")
        return to_group_detail_response_dto(group)


class GetSharedGroupUseCase:
    """Retrieve a group by share slug."""

    def __init__(
        self,
        group_repo: VideoGroupRepository,
    ):
        self.group_repo = group_repo

    def execute(self, share_slug: str) -> VideoGroupDetailResponseDTO:
        """
        Raises:
            ResourceNotFound: If the share slug is invalid.
        """
        group = self.group_repo.get_by_share_slug(share_slug=share_slug)
        if group is None:
            raise ResourceNotFound("Group")
        return to_group_detail_response_dto(group)
