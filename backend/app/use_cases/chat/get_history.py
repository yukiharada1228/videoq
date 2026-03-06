"""
Use case: Retrieve chat history for a group.
"""

from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.use_cases.shared.exceptions import ResourceNotFound


class GetChatHistoryUseCase:
    """Fetch ordered chat logs for a video group (owner only)."""

    def __init__(
        self,
        chat_repo: ChatRepository,
        group_query_repo: VideoGroupQueryRepository,
    ):
        self.chat_repo = chat_repo
        self.group_query_repo = group_query_repo

    def execute(self, group_id: int, user_id: int, ascending: bool = False):
        """
        Returns:
            List[ChatLogEntity]

        Raises:
            ResourceNotFound: If the group does not exist or belongs to another user.
        """
        group = self.group_query_repo.get_with_members(
            group_id=group_id, user_id=user_id
        )
        if group is None:
            raise ResourceNotFound("Group")

        return self.chat_repo.get_logs_for_group(group.id, ascending=ascending)
