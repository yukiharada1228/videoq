"""
Infrastructure implementation of RagGateway.
Prefers QaToolAgent; falls back to classic RagChatService when the agent fails
(e.g. a local model without reliable tool calling).
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
from app.infrastructure.external.qa_agent.agent import QaToolAgent, _QaAgentStreamEnd
from app.infrastructure.external.rag_service import RagChatService, _RagServiceStreamEnd

logger = logging.getLogger(__name__)


class RagChatGateway(RagGateway):
    """Implements RagGateway by preferring QaToolAgent with classic RAG fallback."""

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
        context = group_context or None

        try:
            agent = QaToolAgent(
                user_id=user.id,
                llm=llm,
                video_ids=raw_video_ids,
            )
            result = agent.run(
                messages=raw_messages,
                locale=locale,
                group_context=context,
            )
            return RagResult(
                content=result.content,
                query_text=result.query_text,
                citations=self._to_citation_dtos(result.citations),
                retrieved_contexts=result.retrieved_contexts,
            )
        except OpenAIAuthenticationError as exc:
            raise LLMConfigurationError(
                "Invalid OpenAI API key. Please check your API key in Settings."
            ) from exc
        except Exception as agent_exc:
            logger.warning(
                "QA agent failed; falling back to classic RAG: %s",
                agent_exc,
                exc_info=True,
            )

        try:
            service = RagChatService(user=user, llm=llm, api_key=api_key)
            result = service.run(
                messages=raw_messages,
                video_ids=raw_video_ids,
                locale=locale,
                group_context=context,
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
        context = group_context or None

        agent = QaToolAgent(
            user_id=user.id,
            llm=llm,
            video_ids=raw_video_ids,
        )
        emitted = False
        try:
            for item in agent.stream(
                messages=raw_messages,
                locale=locale,
                group_context=context,
            ):
                chunk = self._to_stream_chunk(item)
                if chunk is None:
                    continue
                emitted = True
                yield chunk
            return
        except OpenAIAuthenticationError as exc:
            raise LLMConfigurationError(
                "Invalid OpenAI API key. Please check your API key in Settings."
            ) from exc
        except Exception as agent_exc:
            if emitted:
                logger.exception("QA agent failed after streaming started: %s", agent_exc)
                raise LLMProviderError(str(agent_exc)) from agent_exc
            logger.warning(
                "QA agent failed; falling back to classic RAG: %s",
                agent_exc,
                exc_info=True,
            )

        try:
            service = RagChatService(user=user, llm=llm, api_key=api_key)
            for item in service.stream(
                messages=raw_messages,
                video_ids=raw_video_ids,
                locale=locale,
                group_context=context,
            ):
                chunk = self._to_stream_chunk(item)
                if chunk is not None:
                    yield chunk
        except OpenAIAuthenticationError as exc:
            raise LLMConfigurationError(
                "Invalid OpenAI API key. Please check your API key in Settings."
            ) from exc
        except (RagUserNotFoundError, LLMConfigurationError):
            raise
        except Exception as exc:
            logger.exception("RAG stream_reply failed: %s", exc)
            raise LLMProviderError(str(exc)) from exc

    def _to_stream_chunk(self, item) -> Optional[RagStreamChunk]:
        if isinstance(item, (_RagServiceStreamEnd, _QaAgentStreamEnd)):
            return RagStreamChunk(
                is_final=True,
                citations=self._to_citation_dtos(item.citations),
                query_text=item.query_text,
                retrieved_contexts=item.retrieved_contexts,
            )
        if item:
            return RagStreamChunk(text=item)
        return None

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
