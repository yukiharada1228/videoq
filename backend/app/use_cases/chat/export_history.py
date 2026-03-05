"""
Use case: Export chat history for a group as CSV rows.
"""

import json
from typing import Generator, List

from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.use_cases.video.exceptions import ResourceNotFound


class ExportChatHistoryUseCase:
    """Export chat logs for a group as a list of CSV-ready rows."""

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
            Each row is a list suitable for csv.writer.writerow().

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
    def _build_rows(queryset):
        for log in queryset:
            try:
                related_videos_str = json.dumps(
                    log.related_videos, ensure_ascii=False
                )
            except Exception:
                related_videos_str = "[]"

            yield [
                log.created_at.isoformat(),
                log.question,
                log.answer,
                "true" if log.is_shared_origin else "false",
                related_videos_str,
                log.feedback or "",
            ]
