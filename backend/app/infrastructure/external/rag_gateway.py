"""
Infrastructure implementation of RagGateway.
Wraps RagChatService (LangChain) for use case consumption.
"""

from typing import Optional, Sequence

from django.contrib.auth import get_user_model

from app.domain.chat.gateways import LLMConfigurationError, LLMProviderError, RagGateway, RagResult
from app.domain.chat.dtos import ChatMessageDTO, RelatedVideoDTO
from app.infrastructure.external.llm import get_langchain_llm
from app.infrastructure.external.rag_service import RagChatService
from app.domain.shared.exceptions import LLMConfigError


class RagChatGateway(RagGateway):
    """Implements RagGateway by delegating to RagChatService."""

    def generate_reply(
        self,
        messages: Sequence[ChatMessageDTO],
        user_id: int,
        video_ids: Optional[Sequence[int]] = None,
        locale: Optional[str] = None,
    ) -> RagResult:
        User = get_user_model()
        # Let DoesNotExist propagate — a missing user is a data/auth bug, not an LLM error.
        user = User.objects.get(pk=user_id)

        try:
            llm = get_langchain_llm(user)
        except LLMConfigError as e:
            raise LLMConfigurationError(str(e)) from e

        service = RagChatService(user=user, llm=llm)
        raw_messages = [
            {"role": message.role, "content": message.content}
            for message in messages
        ]
        raw_video_ids = list(video_ids) if video_ids is not None else None

        try:
            result = service.run(
                messages=raw_messages,
                video_ids=raw_video_ids,
                locale=locale,
            )
        except Exception as exc:
            # Wrap LLM execution failures (API errors, network issues, etc.) as provider errors.
            # Implementation bugs (e.g. TypeError) should not normally reach here;
            # if they do, they surface with the original traceback via __cause__.
            raise LLMProviderError(str(exc)) from exc

        related_videos = None
        if result.related_videos:
            related_videos = [
                RelatedVideoDTO(
                    video_id=int(raw_video.get("video_id", 0) or 0),
                    title=str(raw_video.get("title", "")),
                    start_time=raw_video.get("start_time"),
                    end_time=raw_video.get("end_time"),
                )
                for raw_video in result.related_videos
            ]

        return RagResult(
            content=result.llm_response.content,
            query_text=result.query_text,
            related_videos=related_videos,
        )
