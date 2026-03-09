"""Use case: Retrieval-only related video search for chat/RAG."""

from typing import Optional, Sequence

from app.domain.chat.gateways import LLMProviderError as _DomainLLMProviderError
from app.domain.chat.gateways import RagGateway
from app.domain.chat.gateways import RagUserNotFoundError as _DomainRagUserNotFoundError
from app.domain.chat.repositories import VideoGroupQueryRepository
from app.domain.chat.services import (
    ChatRequestPolicy,
    GroupContextNotFound as _DomainGroupContextNotFound,
    InvalidSendMessageRequest as _DomainInvalidSendMessageRequest,
    OwnerUserResolutionError as _DomainOwnerUserResolutionError,
    require_group_context,
)
from app.use_cases.chat.dto import RelatedVideoResponseDTO, SearchRelatedVideosResultDTO
from app.use_cases.chat.exceptions import InvalidChatRequestError, LLMProviderError
from app.use_cases.shared.exceptions import PermissionDenied, ResourceNotFound


class SearchRelatedVideosUseCase:
    """Execute only the retrieval step of the RAG pipeline."""

    def __init__(
        self,
        group_query_repo: VideoGroupQueryRepository,
        rag_gateway: RagGateway,
    ):
        self.group_query_repo = group_query_repo
        self.rag_gateway = rag_gateway

    def execute(
        self,
        *,
        user_id: Optional[int],
        query_text: str,
        group_id: Optional[int],
        share_token: Optional[str] = None,
        is_shared: bool = False,
    ) -> SearchRelatedVideosResultDTO:
        if not query_text.strip():
            raise InvalidChatRequestError("Query text is empty.")

        policy = ChatRequestPolicy(
            is_shared=is_shared,
            authenticated_user_id=user_id,
            share_token=share_token,
            group_id=group_id,
        )

        try:
            # Reuse shared-access/group precondition rules.
            policy.validate_send_message_preconditions(messages_count=1)
        except _DomainInvalidSendMessageRequest as e:
            raise InvalidChatRequestError(str(e)) from e

        if group_id is None:
            raise InvalidChatRequestError("Group ID not specified.")

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
            owner_user_id = policy.resolve_owner_user_id(group_user_id=group.user_id)
        except _DomainOwnerUserResolutionError as e:
            raise PermissionDenied(str(e)) from e

        video_ids: Sequence[int] = group.member_video_ids

        try:
            related_videos = self.rag_gateway.search_related_videos(
                query_text=query_text,
                user_id=owner_user_id,
                video_ids=video_ids,
            )
        except _DomainRagUserNotFoundError as e:
            raise ResourceNotFound("User") from e
        except _DomainLLMProviderError as e:
            raise LLMProviderError(str(e)) from e

        return SearchRelatedVideosResultDTO(
            query_text=query_text,
            related_videos=(
                [
                    RelatedVideoResponseDTO(
                        video_id=v.video_id,
                        title=v.title,
                        start_time=v.start_time,
                        end_time=v.end_time,
                    )
                    for v in (related_videos or [])
                ]
                or None
            ),
        )
