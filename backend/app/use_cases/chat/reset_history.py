"""
Use case: Reset (delete all) chat history for a group.
"""

from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.domain.chat.services import (
    GroupContextNotFound as _DomainGroupContextNotFound,
    require_group_context,
)
from app.use_cases.shared.exceptions import ResourceNotFound


class ResetChatHistoryUseCase:
    """Delete all chat logs for a video group (owner only)."""

    def __init__(
        self,
        chat_repo: ChatRepository,
        group_query_repo: VideoGroupQueryRepository,
    ):
        self.chat_repo = chat_repo
        self.group_query_repo = group_query_repo

    def execute(self, group_id: int, user_id: int) -> None:
        """
        Raises:
            ResourceNotFound: If the group does not exist or belongs to another user.
        """
        try:
            group = require_group_context(
                self.group_query_repo.get_with_members(group_id=group_id, user_id=user_id)
            )
        except _DomainGroupContextNotFound:
            raise ResourceNotFound("Group")

        self.chat_repo.delete_logs_for_group(group.id)
