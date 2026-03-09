"""
Use case: Delete a video group.
"""

from app.domain.video.repositories import VideoGroupRepository
from app.use_cases.video.exceptions import ResourceNotFound


class DeleteVideoGroupUseCase:
    """Delete a video group owned by a user."""

    def __init__(self, group_repo: VideoGroupRepository):
        self.group_repo = group_repo

    def execute(self, group_id: int, user_id: int) -> None:
        """
        Raises:
            ResourceNotFound: If the group does not exist.
        """
        group = self.group_repo.get_by_id(group_id=group_id, user_id=user_id)
        if group is None:
            raise ResourceNotFound("Video group")
        self.group_repo.delete(group)
