"""
Use case: Retrieve chat history for a group.
"""

from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.use_cases.video.exceptions import ResourceNotFound


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
            QuerySet of ChatLog (may be empty if group not found).
        """
        from app.models import ChatLog

        group = self.group_query_repo.get_with_members(
            group_id=group_id, user_id=user_id
        )
        if group is None:
            return ChatLog.objects.none()

        return self.chat_repo.get_logs_for_group(group, ascending=ascending)
