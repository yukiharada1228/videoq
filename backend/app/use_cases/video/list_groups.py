"""
Use case: List video groups for a user.
"""

from typing import List

from app.domain.video.repositories import VideoGroupRepository
from app.use_cases.video.dto import VideoGroupListResponseDTO
from app.use_cases.video.file_url import to_group_list_response_dtos


class ListVideoGroupsUseCase:
    """Retrieve all video groups for a user."""

    def __init__(self, group_repo: VideoGroupRepository):
        self.group_repo = group_repo

    def execute(
        self, user_id: int, include_videos: bool = False
    ) -> List[VideoGroupListResponseDTO]:
        groups = self.group_repo.list_for_user(user_id=user_id, include_videos=include_videos)
        return to_group_list_response_dtos(groups)
