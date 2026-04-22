"""
Infrastructure implementation of RagGateway.
Wraps RagChatService (LangChain) for use case consumption.
"""

import logging
from typing import Iterator, Optional, Sequence

from django.contrib.auth import get_user_model
from openai import AuthenticationError as OpenAIAuthenticationError

from app.domain.chat.gateways import (
    LLMConfigurationError,
    LLMProviderError,
    RagGateway,
    RagResult,
    RagStreamChunk,
    RagUserNotFoundError,
)
from app.domain.chat.dtos import ChatMessageDTO, CitationDTO
from app.infrastructure.external.llm import get_langchain_llm
from app.infrastructure.external.rag_service import RagChatService, _RagServiceStreamEnd
from app.domain.shared.exceptions import LLMConfigError

logger = logging.getLogger(__name__)


class RagChatGateway(RagGateway):
    """Implements RagGateway by delegating to RagChatService."""

    def generate_reply(
        self,
        messages: Sequence[ChatMessageDTO],
        user_id: int,
        video_ids: Optional[Sequence[int]] = None,
        locale: Optional[str] = None,
        api_key: Optional[str] = None,
        group_context: Optional[str] = None,
    ) -> RagResult:
        User = get_user_model()
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist as exc:
            raise RagUserNotFoundError(f"User not found: {user_id}") from exc

        try:
            llm = get_langchain_llm(api_key=api_key)
        except LLMConfigError as e:
            raise LLMConfigurationError(str(e)) from e

        service = RagChatService(user=user, llm=llm, api_key=api_key)
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
                group_context=group_context or None,
            )
        except OpenAIAuthenticationError as exc:
            raise LLMConfigurationError(
                "Invalid OpenAI API key. Please check your API key in Settings."
            ) from exc
        except Exception as exc:
            logger.exception("RAG generate_reply failed: %s", exc)
            raise LLMProviderError(str(exc)) from exc

        citations = None
        if result.citations:
            citations = [
                CitationDTO(
                    video_id=int(raw_video.get("video_id", 0) or 0),
                    title=str(raw_video.get("title", "")),
                    start_time=raw_video.get("start_time"),
                    end_time=raw_video.get("end_time"),
                )
                for raw_video in result.citations
            ]

        content = result.llm_response.content
        content_text = content if isinstance(content, str) else str(content)

        return RagResult(
            content=content_text,
            query_text=result.query_text,
            citations=citations,
            retrieved_contexts=result.retrieved_contexts,
        )

    def stream_reply(
        self,
        messages: Sequence[ChatMessageDTO],
        user_id: int,
        video_ids: Optional[Sequence[int]] = None,
        locale: Optional[str] = None,
        api_key: Optional[str] = None,
        group_context: Optional[str] = None,
    ) -> Iterator[RagStreamChunk]:
        User = get_user_model()
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist as exc:
            raise RagUserNotFoundError(f"User not found: {user_id}") from exc

        try:
            llm = get_langchain_llm(api_key=api_key)
        except LLMConfigError as e:
            raise LLMConfigurationError(str(e)) from e

        service = RagChatService(user=user, llm=llm, api_key=api_key)
        raw_messages = [
            {"role": message.role, "content": message.content}
            for message in messages
        ]
        raw_video_ids = list(video_ids) if video_ids is not None else None

        try:
            for item in service.stream(
                messages=raw_messages,
                video_ids=raw_video_ids,
                locale=locale,
                group_context=group_context or None,
            ):
                if isinstance(item, _RagServiceStreamEnd):
                    citations = None
                    if item.citations:
                        citations = [
                            CitationDTO(
                                video_id=int(raw_video.get("video_id", 0) or 0),
                                title=str(raw_video.get("title", "")),
                                start_time=raw_video.get("start_time"),
                                end_time=raw_video.get("end_time"),
                            )
                            for raw_video in item.citations
                        ]
                    yield RagStreamChunk(
                        is_final=True,
                        citations=citations,
                        query_text=item.query_text,
                        retrieved_contexts=item.retrieved_contexts,
                    )
                else:
                    if item:
                        yield RagStreamChunk(text=item)
        except OpenAIAuthenticationError as exc:
            raise LLMConfigurationError(
                "Invalid OpenAI API key. Please check your API key in Settings."
            ) from exc
        except (RagUserNotFoundError, LLMConfigurationError):
            raise
        except Exception as exc:
            logger.exception("RAG stream_reply failed: %s", exc)
            raise LLMProviderError(str(exc)) from exc
