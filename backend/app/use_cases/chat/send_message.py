"""
Use case: Send a chat message with optional RAG context.
"""

from dataclasses import dataclass
from typing import List, Optional, Sequence

from app.domain.chat.dtos import ChatMessageDTO, RelatedVideoDTO
from app.domain.chat.gateways import LLMConfigurationError as _DomainLLMConfigError
from app.domain.chat.gateways import LLMProviderError as _DomainLLMProviderError
from app.domain.chat.gateways import RagGateway
from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.use_cases.chat.exceptions import LLMConfigurationError, LLMProviderError
from app.use_cases.shared.exceptions import PermissionDenied, ResourceNotFound


@dataclass
class SendMessageResult:
    """Result returned from SendMessageUseCase."""

    content: str
    related_videos: Optional[Sequence[RelatedVideoDTO]]
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
        rag_gateway: RagGateway,
    ):
        self.chat_repo = chat_repo
        self.group_query_repo = group_query_repo
        self.rag_gateway = rag_gateway

    def execute(
        self,
        user_id: Optional[int],
        messages: List[ChatMessageDTO],
        group_id: Optional[int] = None,
        share_token: Optional[str] = None,
        is_shared: bool = False,
        locale: Optional[str] = None,
    ) -> SendMessageResult:
        """
        Args:
            user_id: ID of the authenticated user (None only for share-token flows).
            messages: Conversation history as typed DTO messages.
            group_id: Optional group ID for RAG retrieval.
            share_token: Optional share token (shared access flow).
            is_shared: Whether the request originates from a share token.
            locale: Accept-Language locale string.

        Returns:
            SendMessageResult

        Raises:
            ResourceNotFound: If the specified group does not exist.
            PermissionDenied: If owner user cannot be resolved (unauthenticated without share context).
            LLMConfigurationError: If the LLM cannot be configured.
            LLMProviderError: If the LLM provider returns an error.
        """
        group = None
        if group_id is not None:
            if is_shared and share_token:
                group = self.group_query_repo.get_with_members(
                    group_id=group_id, share_token=share_token
                )
            else:
                group = self.group_query_repo.get_with_members(
                    group_id=group_id, user_id=user_id
                )
            if group is None:
                raise ResourceNotFound("Group")

        owner_user_id = group.user_id if (is_shared and group) else user_id
        if owner_user_id is None:
            raise PermissionDenied("Authentication is required to send messages.")

        video_ids = group.member_video_ids if group else None

        try:
            rag_result = self.rag_gateway.generate_reply(
                messages=messages,
                user_id=owner_user_id,
                video_ids=video_ids,
                locale=locale,
            )
        except _DomainLLMConfigError as e:
            raise LLMConfigurationError(str(e)) from e
        except _DomainLLMProviderError as e:
            raise LLMProviderError(str(e)) from e

        chat_log_id: Optional[int] = None
        feedback: Optional[str] = None

        if group is not None:
            chat_log = self.chat_repo.create_log(
                user_id=owner_user_id,
                group_id=group.id,
                question=rag_result.query_text,
                answer=rag_result.content,
                related_videos=rag_result.related_videos,
                is_shared=is_shared,
            )
            chat_log_id = chat_log.id
            feedback = chat_log.feedback

        return SendMessageResult(
            content=rag_result.content,
            related_videos=rag_result.related_videos if group_id is not None else None,
            chat_log_id=chat_log_id,
            feedback=feedback,
        )
