"""
Use case: Send a chat message with optional RAG context.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional

from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.infrastructure.external.rag_service import RagChatResult, RagChatService
from app.models import VideoGroup


@dataclass
class SendMessageResult:
    """Result returned from SendMessageUseCase."""

    content: str
    related_videos: Optional[List[Dict]]
    chat_log_id: Optional[int]
    feedback: Optional[str]


class SendMessageUseCase:
    """
    Orchestrates a single chat turn:
    1. Resolve the video group context (if any)
    2. Run the RAG chain
    3. Persist the ChatLog
    4. Return a structured result
    """

    def __init__(
        self,
        chat_repo: ChatRepository,
        group_query_repo: VideoGroupQueryRepository,
    ):
        self.chat_repo = chat_repo
        self.group_query_repo = group_query_repo

    def execute(
        self,
        user,
        llm,
        messages: List[Dict],
        group_id: Optional[int] = None,
        group: Optional[VideoGroup] = None,
        is_shared: bool = False,
        locale: Optional[str] = None,
    ) -> SendMessageResult:
        """
        Args:
            user: The authenticated user (or the group owner when is_shared=True).
            llm: LangChain-compatible LLM instance.
            messages: List of {"role": ..., "content": ...} dicts.
            group_id: Optional group ID for RAG retrieval.
            group: Pre-fetched VideoGroup (used in shared access flow).
            is_shared: Whether the request originates from a share token.
            locale: Accept-Language locale string.

        Returns:
            SendMessageResult
        """
        if group_id is not None and group is None:
            group = self.group_query_repo.get_with_members(
                group_id=group_id, user_id=user.id
            )
            if group is None:
                from app.use_cases.video.exceptions import ResourceNotFound
                raise ResourceNotFound("Group")

        service = RagChatService(user=user, llm=llm)
        result: RagChatResult = service.run(
            messages=messages,
            group=group if group_id is not None else None,
            locale=locale,
        )

        chat_log_id: Optional[int] = None
        feedback: Optional[str] = None

        if group_id is not None and group is not None:
            log_user = group.user if is_shared else user
            chat_log = self.chat_repo.create_log(
                user=log_user,
                group=group,
                question=result.query_text,
                answer=result.llm_response.content,
                related_videos=result.related_videos or [],
                is_shared=is_shared,
            )
            chat_log_id = chat_log.id
            feedback = chat_log.feedback

        return SendMessageResult(
            content=result.llm_response.content,
            related_videos=result.related_videos if group_id is not None else None,
            chat_log_id=chat_log_id,
            feedback=feedback,
        )
