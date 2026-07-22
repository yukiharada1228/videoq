"""
Infrastructure implementation of RagGateway.
Wraps RagChatService (LangChain) or QaToolAgent for use case consumption.
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
from app.domain.shared.exceptions import ProviderConfigError
from app.infrastructure.external.llm import get_langchain_llm
from app.infrastructure.external.qa_agent.agent import (
    QaToolAgent,
    _QaAgentStreamEnd,
    is_qa_agent_enabled,
)
from app.infrastructure.external.rag_service import RagChatService, _RagServiceStreamEnd

logger = logging.getLogger(__name__)


class RagChatGateway(RagGateway):
    """Implements RagGateway by delegating to RagChatService or QaToolAgent."""

    def generate_reply(
        self,
        messages: Sequence[ChatMessageDTO],
        user_id: int,
        video_ids: Optional[Sequence[int]] = None,
        locale: Optional[str] = None,
        api_key: Optional[str] = None,
        group_context: Optional[str] = None,
        persist_learner_state: bool = True,
        learner_session_key: Optional[str] = None,
    ) -> RagResult:
        del persist_learner_state, learner_session_key
        User = get_user_model()
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist as exc:
            raise RagUserNotFoundError(f"User not found: {user_id}") from exc

        try:
            llm = get_langchain_llm(api_key=api_key)
        except ProviderConfigError as e:
            raise LLMConfigurationError(str(e)) from e

        raw_messages = [
            {"role": message.role, "content": message.content}
            for message in messages
        ]
        raw_video_ids = list(video_ids) if video_ids is not None else None

        try:
            if is_qa_agent_enabled():
                agent = QaToolAgent(
                    user_id=user.id,
                    llm=llm,
                    video_ids=raw_video_ids,
                )
                result = agent.run(
                    messages=raw_messages,
                    locale=locale,
                    group_context=group_context or None,
                )
                return RagResult(
                    content=result.content,
                    query_text=result.query_text,
                    citations=self._to_citation_dtos(result.citations),
                    retrieved_contexts=result.retrieved_contexts,
                )

            service = RagChatService(user=user, llm=llm, api_key=api_key)
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

        content = result.llm_response.content
        content_text = content if isinstance(content, str) else str(content)

        return RagResult(
            content=content_text,
            query_text=result.query_text,
            citations=self._to_citation_dtos(result.citations),
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
        persist_learner_state: bool = True,
        learner_session_key: Optional[str] = None,
    ) -> Iterator[RagStreamChunk]:
        del persist_learner_state, learner_session_key
        User = get_user_model()
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist as exc:
            raise RagUserNotFoundError(f"User not found: {user_id}") from exc

        try:
            llm = get_langchain_llm(api_key=api_key)
        except ProviderConfigError as e:
            raise LLMConfigurationError(str(e)) from e

        raw_messages = [
            {"role": message.role, "content": message.content}
            for message in messages
        ]
        raw_video_ids = list(video_ids) if video_ids is not None else None

        try:
            if is_qa_agent_enabled():
                agent = QaToolAgent(
                    user_id=user.id,
                    llm=llm,
                    video_ids=raw_video_ids,
                )
                stream_iter = agent.stream(
                    messages=raw_messages,
                    locale=locale,
                    group_context=group_context or None,
                )
            else:
                service = RagChatService(user=user, llm=llm, api_key=api_key)
                stream_iter = service.stream(
                    messages=raw_messages,
                    video_ids=raw_video_ids,
                    locale=locale,
                    group_context=group_context or None,
                )

            for item in stream_iter:
                if isinstance(item, (_RagServiceStreamEnd, _QaAgentStreamEnd)):
                    yield RagStreamChunk(
                        is_final=True,
                        citations=self._to_citation_dtos(item.citations),
                        query_text=item.query_text,
                        retrieved_contexts=item.retrieved_contexts,
                    )
                elif item:
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

    @staticmethod
    def _to_citation_dtos(
        raw_citations: Optional[Sequence[dict]],
    ) -> Optional[list[CitationDTO]]:
        if not raw_citations:
            return None
        return [
            CitationDTO(
                video_id=int(raw_video.get("video_id", 0) or 0),
                title=str(raw_video.get("title", "")),
                start_time=raw_video.get("start_time"),
                end_time=raw_video.get("end_time"),
            )
            for raw_video in raw_citations
        ]
