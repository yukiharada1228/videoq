"""
Use case: Export chat history for a group as domain rows.
"""

from typing import Generator

from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.use_cases.chat.dto import ChatHistoryExportRow
from app.use_cases.shared.exceptions import ResourceNotFound


class ExportChatHistoryUseCase:
    """Export chat logs for a group as a sequence of ChatHistoryExportRow DTOs."""

    def __init__(
        self,
        chat_repo: ChatRepository,
        group_query_repo: VideoGroupQueryRepository,
    ):
        self.chat_repo = chat_repo
        self.group_query_repo = group_query_repo

    def execute(self, group_id: int, user_id: int):
        """
        Returns:
            tuple: (group_id, rows_generator)
            Each row is a ChatHistoryExportRow DTO.

        Raises:
            ResourceNotFound: If the group does not exist.
        """
        group = self.group_query_repo.get_with_members(
            group_id=group_id, user_id=user_id
        )
        if group is None:
            raise ResourceNotFound("Group")

        logs = self.chat_repo.get_logs_for_group(group.id, ascending=True)
        return group.id, self._build_rows(logs)

    @staticmethod
    def _build_rows(queryset) -> Generator[ChatHistoryExportRow, None, None]:
        for log in queryset:
            yield ChatHistoryExportRow(
                created_at=log.created_at,
                question=log.question,
                answer=log.answer,
                is_shared_origin=log.is_shared_origin,
                related_videos=log.related_videos,
                feedback=log.feedback,
            )
