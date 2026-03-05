"""
Infrastructure implementation of RagGateway.
Wraps RagChatService (LangChain) for use case consumption.
"""

from typing import Dict, List, Optional

from django.contrib.auth import get_user_model

from app.domain.chat.gateways import LLMConfigurationError, LLMProviderError, RagGateway, RagResult
from app.infrastructure.external.llm import get_langchain_llm
from app.infrastructure.external.rag_service import RagChatService
from app.use_cases.shared.exceptions import LLMConfigError


class RagChatGateway(RagGateway):
    """Implements RagGateway by delegating to RagChatService."""

    def generate_reply(
        self,
        messages: List[Dict],
        user_id: int,
        video_ids: Optional[List[int]] = None,
        locale: Optional[str] = None,
    ) -> RagResult:
        User = get_user_model()
        user = User.objects.get(pk=user_id)

        try:
            llm = get_langchain_llm(user)
        except LLMConfigError as e:
            raise LLMConfigurationError(str(e)) from e

        try:
            service = RagChatService(user=user, llm=llm)
            result = service.run(messages=messages, video_ids=video_ids, locale=locale)
        except Exception as exc:
            raise LLMProviderError(str(exc)) from exc

        return RagResult(
            content=result.llm_response.content,
            query_text=result.query_text,
            related_videos=result.related_videos,
        )
