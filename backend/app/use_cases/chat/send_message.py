"""
Use case: Send a chat message with optional RAG context.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional

from app.domain.chat.dtos import ChatMessageDTO, RelatedVideoDTO
from app.domain.chat.gateways import LLMConfigurationError as _DomainLLMConfigError
from app.domain.chat.gateways import LLMProviderError as _DomainLLMProviderError
from app.domain.chat.gateways import RagGateway
from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.use_cases.chat.exceptions import LLMConfigurationError, LLMProviderError
from app.use_cases.shared.exceptions import ResourceNotFound


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
        rag_gateway: RagGateway,
    ):
        self.chat_repo = chat_repo
        self.group_query_repo = group_query_repo
        self.rag_gateway = rag_gateway

    def execute(
        self,
        user_id: Optional[int],
        messages: List[Dict],
        group_id: Optional[int] = None,
        share_token: Optional[str] = None,
        is_shared: bool = False,
        locale: Optional[str] = None,
    ) -> SendMessageResult:
        """
        Args:
            user_id: ID of the authenticated user.
            messages: List of {"role": ..., "content": ...} dicts.
            group_id: Optional group ID for RAG retrieval.
            share_token: Optional share token (shared access flow).
            is_shared: Whether the request originates from a share token.
            locale: Accept-Language locale string.

        Returns:
            SendMessageResult

        Raises:
            ResourceNotFound: If the specified group does not exist.
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
        video_ids = group.member_video_ids if group else None
        message_dtos = [ChatMessageDTO.from_dict(message) for message in messages]

        try:
            rag_result = self.rag_gateway.generate_reply(
                messages=message_dtos,
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
            related_video_dicts = self._related_videos_to_dicts(rag_result.related_videos)
            chat_log = self.chat_repo.create_log(
                user_id=owner_user_id,
                group_id=group.id,
                question=rag_result.query_text,
                answer=rag_result.content,
                related_videos=related_video_dicts,
                is_shared=is_shared,
            )
            chat_log_id = chat_log.id
            feedback = chat_log.feedback

        return SendMessageResult(
            content=rag_result.content,
            related_videos=(
                self._related_videos_to_dicts(rag_result.related_videos)
                if group_id is not None
                else None
            ),
            chat_log_id=chat_log_id,
            feedback=feedback,
        )

    @staticmethod
    def _related_videos_to_dicts(
        related_videos: Optional[List[Dict] | List[RelatedVideoDTO]]
    ) -> List[Dict]:
        if not related_videos:
            return []
        result: List[Dict] = []
        for item in related_videos:
            if isinstance(item, RelatedVideoDTO):
                result.append(item.to_dict())
            elif isinstance(item, dict):
                result.append(item)
        return result
