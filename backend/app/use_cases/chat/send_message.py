"""Use case: Send a chat message with optional RAG context."""

from typing import List, Optional

from app.domain.chat.dtos import ChatMessageDTO
from app.domain.chat.gateways import LLMConfigurationError as _DomainLLMConfigError
from app.domain.chat.gateways import LLMProviderError as _DomainLLMProviderError
from app.domain.chat.gateways import RagGateway
from app.domain.chat.gateways import RagUserNotFoundError as _DomainRagUserNotFoundError
from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.domain.user.ports import OpenAiApiKeyRepository
from app.domain.chat.services import (
    ChatRequestPolicy,
    GroupContextNotFound as _DomainGroupContextNotFound,
    InvalidSendMessageRequest as _DomainInvalidSendMessageRequest,
    OwnerUserResolutionError as _DomainOwnerUserResolutionError,
    require_group_context,
)
from app.use_cases.chat.dto import (
    ChatMessageInput,
    RelatedVideoResponseDTO,
    SendMessageResultDTO,
)
from app.use_cases.chat.exceptions import (
    InvalidChatRequestError,
    LLMConfigurationError,
    LLMProviderError,
)
from app.use_cases.shared.exceptions import PermissionDenied, ResourceNotFound


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
        api_key_repo: Optional[OpenAiApiKeyRepository] = None,
    ):
        self.chat_repo = chat_repo
        self.group_query_repo = group_query_repo
        self.rag_gateway = rag_gateway
        self.api_key_repo = api_key_repo

    def execute(
        self,
        user_id: Optional[int],
        messages: List[ChatMessageInput],
        group_id: Optional[int] = None,
        share_token: Optional[str] = None,
        is_shared: bool = False,
        locale: Optional[str] = None,
    ) -> SendMessageResultDTO:
        """
        Args:
            user_id: ID of the authenticated user (None only for share-token flows).
            messages: Conversation history as ChatMessageInput (use-case boundary DTO).
            group_id: Optional group ID for RAG retrieval.
            share_token: Optional share token (shared access flow).
            is_shared: Whether the request originates from a share token.
            locale: Accept-Language locale string.

        Returns:
            SendMessageResultDTO

        Raises:
            InvalidChatRequestError: If required input preconditions are not met.
            ResourceNotFound: If the specified group does not exist.
            PermissionDenied: If owner user cannot be resolved (unauthenticated without share context).
            LLMConfigurationError: If the LLM cannot be configured.
            LLMProviderError: If the LLM provider returns an error.
        """
        policy = ChatRequestPolicy(
            is_shared=is_shared,
            authenticated_user_id=user_id,
            share_token=share_token,
            group_id=group_id,
        )
        try:
            policy.validate_send_message_preconditions(messages_count=len(messages))
        except _DomainInvalidSendMessageRequest as e:
            raise InvalidChatRequestError(str(e)) from e

        # Map input DTOs to domain DTOs before passing to gateway
        domain_messages = [ChatMessageDTO(role=m.role, content=m.content) for m in messages]

        group = None
        if group_id is not None:
            if is_shared and share_token:
                group_candidate = self.group_query_repo.get_with_members(
                    group_id=group_id,
                    share_token=share_token,
                )
            else:
                group_candidate = self.group_query_repo.get_with_members(
                    group_id=group_id,
                    user_id=user_id,
                )
            try:
                group = require_group_context(group_candidate)
            except _DomainGroupContextNotFound:
                raise ResourceNotFound("Group")

        try:
            owner_user_id = policy.resolve_owner_user_id(
                group_user_id=group.user_id if group is not None else None
            )
        except _DomainOwnerUserResolutionError as e:
            raise PermissionDenied(str(e)) from e

        # Resolve per-user API key (may be None for local-model setups)
        api_key = None
        if self.api_key_repo is not None:
            api_key = self.api_key_repo.get_decrypted_key(owner_user_id)

        video_ids = group.member_video_ids if group else None

        try:
            rag_result = self.rag_gateway.generate_reply(
                messages=domain_messages,
                user_id=owner_user_id,
                video_ids=video_ids,
                locale=locale,
                api_key=api_key,
            )
        except _DomainRagUserNotFoundError as e:
            raise ResourceNotFound("User") from e
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

        return SendMessageResultDTO(
            content=rag_result.content,
            related_videos=(
                [
                    RelatedVideoResponseDTO(
                        video_id=v.video_id,
                        title=v.title,
                        start_time=v.start_time,
                        end_time=v.end_time,
                    )
                    for v in (rag_result.related_videos or [])
                ]
                if group_id is not None
                else None
            ),
            chat_log_id=chat_log_id,
            feedback=feedback,
        )
