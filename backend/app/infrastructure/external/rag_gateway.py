"""
Infrastructure implementation of RagGateway.
Wraps RagChatService (LangChain) for use case consumption.
"""

from typing import Any, Dict, List, Optional

from django.contrib.auth import get_user_model

from app.domain.chat.gateways import RagGateway, RagResult
from app.infrastructure.external.rag_service import RagChatService


class RagChatGateway(RagGateway):
    """Implements RagGateway by delegating to RagChatService."""

    def generate_reply(
        self,
        messages: List[Dict],
        user_id: int,
        llm: Any,
        video_ids: Optional[List[int]] = None,
        locale: Optional[str] = None,
    ) -> RagResult:
        User = get_user_model()
        user = User.objects.get(pk=user_id)
        service = RagChatService(user=user, llm=llm)
        result = service.run(messages=messages, video_ids=video_ids, locale=locale)
        return RagResult(
            content=result.llm_response.content,
            query_text=result.query_text,
            related_videos=result.related_videos,
        )
