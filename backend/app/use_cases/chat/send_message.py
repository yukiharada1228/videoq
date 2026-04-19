"""Use case: Send a chat message with optional RAG context."""

import logging
from typing import Generator, List, Optional, Union

from app.domain.chat.dtos import ChatMessageDTO
from app.domain.chat.gateways import LLMConfigurationError as _DomainLLMConfigError
from app.domain.chat.gateways import LLMProviderError as _DomainLLMProviderError
from app.domain.chat.gateways import RagGateway
from app.domain.chat.gateways import RagUserNotFoundError as _DomainRagUserNotFoundError
from app.domain.chat.repositories import ChatRepository, VideoGroupQueryRepository
from app.domain.chat.services import (
    ChatRequestPolicy,
    GroupContextNotFound as _DomainGroupContextNotFound,
    InvalidSendMessageRequest as _DomainInvalidSendMessageRequest,
    OwnerUserResolutionError as _DomainOwnerUserResolutionError,
    require_group_context,
)
from app.use_cases.chat.dto import (
    ChatMessageInput,
    CitationResponseDTO,
    SendMessageResultDTO,
    StreamContentChunk,
    StreamDoneEvent,
)
from app.use_cases.chat.exceptions import (
    InvalidChatRequestError,
    LLMConfigurationError,
    LLMProviderError,
)
from app.use_cases.shared.exceptions import PermissionDenied, ResourceNotFound

logger = logging.getLogger(__name__)


class SendMessageUseCase:
    """
    Orchestrates a single chat turn:
    1. Resolve the video group context (if any)
    2. Run the RAG chain
    3. Persist the ChatLog
    4. Return a structured result
    5. (Optional) Record AI answer usage for account limits
    """

    def __init__(
        self,
        chat_repo: ChatRepository,
        group_query_repo: VideoGroupQueryRepository,
        rag_gateway: RagGateway,
        ai_answer_limit_check_use_case=None,
        ai_answer_record_use_case=None,
    ):
        self.chat_repo = chat_repo
        self.group_query_repo = group_query_repo
        self.rag_gateway = rag_gateway
        self._ai_answer_limit_check_use_case = ai_answer_limit_check_use_case
        self._ai_answer_record_use_case = ai_answer_record_use_case

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

        if self._ai_answer_limit_check_use_case is not None and owner_user_id is not None:
            self._ai_answer_limit_check_use_case.execute(owner_user_id)

        video_ids = group.member_video_ids if group else None

        try:
            rag_result = self.rag_gateway.generate_reply(
                messages=domain_messages,
                user_id=owner_user_id,
                video_ids=video_ids,
                locale=locale,
                api_key=None,
                group_context=group.description if group is not None else None,
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
                citations=rag_result.citations,
                is_shared=is_shared,
            )
            chat_log_id = chat_log.id
            feedback = chat_log.feedback

        result = SendMessageResultDTO(
            content=rag_result.content,
            citations=(
                [
                    CitationResponseDTO(
                        id=index,
                        video_id=v.video_id,
                        title=v.title,
                        start_time=v.start_time,
                        end_time=v.end_time,
                    )
                    for index, v in enumerate(rag_result.citations or [], start=1)
                ]
                if group_id is not None
                else None
            ),
            chat_log_id=chat_log_id,
            feedback=feedback,
        )

        if self._ai_answer_record_use_case is not None and owner_user_id is not None:
            try:
                self._ai_answer_record_use_case.execute(owner_user_id)
            except Exception:
                logger.warning(
                    "Failed to record AI answer usage for user %s",
                    owner_user_id,
                    exc_info=True,
                )

        return result

    def stream_execute(
        self,
        user_id: Optional[int],
        messages: List[ChatMessageInput],
        group_id: Optional[int] = None,
        share_token: Optional[str] = None,
        is_shared: bool = False,
        locale: Optional[str] = None,
    ) -> Generator[Union[StreamContentChunk, StreamDoneEvent], None, None]:
        """Streaming variant of execute().

        Yields:
            ``StreamContentChunk`` for each token from the LLM.
            ``StreamDoneEvent`` as the final item with full metadata.

        Raises the same exceptions as ``execute()`` for setup failures
        (validation, resource resolution) before any yielding occurs.
        LLM errors during generation are re-raised and propagate through the generator.
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

        if self._ai_answer_limit_check_use_case is not None and owner_user_id is not None:
            self._ai_answer_limit_check_use_case.execute(owner_user_id)

        video_ids = group.member_video_ids if group else None

        full_content = ""
        final_citations = None
        query_text = ""

        try:
            for chunk in self.rag_gateway.stream_reply(
                messages=domain_messages,
                user_id=owner_user_id,
                video_ids=video_ids,
                locale=locale,
                api_key=None,
                group_context=group.description if group is not None else None,
            ):
                if chunk.is_final:
                    final_citations = chunk.citations
                    query_text = chunk.query_text or ""
                elif chunk.text is not None:
                    full_content += chunk.text
                    yield StreamContentChunk(text=chunk.text)
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
                question=query_text,
                answer=full_content,
                citations=final_citations,
                is_shared=is_shared,
            )
            chat_log_id = chat_log.id
            feedback = chat_log.feedback

        yield StreamDoneEvent(
            content=full_content,
            citations=(
                [
                    CitationResponseDTO(
                        id=index,
                        video_id=v.video_id,
                        title=v.title,
                        start_time=v.start_time,
                        end_time=v.end_time,
                    )
                    for index, v in enumerate(final_citations or [], start=1)
                ]
                if group_id is not None
                else None
            ),
            chat_log_id=chat_log_id,
            feedback=feedback,
        )

        if self._ai_answer_record_use_case is not None and owner_user_id is not None:
            try:
                self._ai_answer_record_use_case.execute(owner_user_id)
            except Exception:
                logger.warning(
                    "Failed to record AI answer usage for user %s",
                    owner_user_id,
                    exc_info=True,
                )
