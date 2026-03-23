"""
Use case: Retrieve chat history for a group.
"""

from app.domain.chat.reference_markup import repair_ref_markup
from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.domain.chat.services import (
    GroupContextNotFound as _DomainGroupContextNotFound,
    require_group_context,
)
from app.use_cases.chat.dto import ChatLogResponseDTO, CitationResponseDTO
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

    def execute(
        self, group_id: int, user_id: int, ascending: bool = False
    ) -> list[ChatLogResponseDTO]:
        """
        Returns:
            List[ChatLogResponseDTO]

        Raises:
            ResourceNotFound: If the group does not exist or belongs to another user.
        """
        try:
            group = require_group_context(
                self.group_query_repo.get_with_members(group_id=group_id, user_id=user_id)
            )
        except _DomainGroupContextNotFound:
            raise ResourceNotFound("Group")

        logs = self.chat_repo.get_logs_for_group(group.id, ascending=ascending)
        return [
            ChatLogResponseDTO(
                id=log.id,
                group_id=log.group_id,
                question=log.question,
                answer=repair_ref_markup(log.answer),
                citations=[
                    CitationResponseDTO(
                        id=index,
                        video_id=video.video_id,
                        title=video.title,
                        start_time=video.start_time,
                        end_time=video.end_time,
                    )
                    for index, video in enumerate(log.citations, start=1)
                ],
                is_shared_origin=log.is_shared_origin,
                feedback=log.feedback,
                created_at=log.created_at,
            )
            for log in logs
        ]
