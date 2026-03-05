"""
Gateway interfaces for the chat domain.
Abstract contracts for external services used by chat use cases.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class RagResult:
    """Result returned from the RAG gateway."""

    content: str
    query_text: str
    related_videos: Optional[List[Dict]] = field(default=None)


class RagGateway(ABC):
    """Abstract interface for the RAG (Retrieval-Augmented Generation) service."""

    @abstractmethod
    def generate_reply(
        self,
        messages: List[Dict],
        user_id: int,
        llm: Any,
        video_ids: Optional[List[int]] = None,
        locale: Optional[str] = None,
    ) -> RagResult:
        """
        Execute the RAG pipeline and return the assistant's reply.

        Args:
            messages: Conversation history as list of {"role": ..., "content": ...}.
            user_id: ID of the user making the request (for retrieval scoping).
            llm: LangChain-compatible LLM instance (opaque to domain).
            video_ids: Optional list of video IDs to scope retrieval to.
            locale: Accept-Language locale string for response language hints.

        Returns:
            RagResult with content, query_text, and optional related_videos.
        """
        ...
