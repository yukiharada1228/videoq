"""
Gateway interfaces for the chat domain.
Abstract contracts for external services used by chat use cases.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List, Optional


class LLMConfigurationError(Exception):
    """Raised when the LLM cannot be configured (missing/invalid API key, unknown provider)."""


class LLMProviderError(Exception):
    """Raised when the LLM provider returns an error during generation."""


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
        video_ids: Optional[List[int]] = None,
        locale: Optional[str] = None,
    ) -> RagResult:
        """
        Execute the RAG pipeline and return the assistant's reply.

        Args:
            messages: Conversation history as list of {"role": ..., "content": ...}.
            user_id: ID of the user making the request (for retrieval scoping).
            video_ids: Optional list of video IDs to scope retrieval to.
            locale: Accept-Language locale string for response language hints.

        Returns:
            RagResult with content, query_text, and optional related_videos.

        Raises:
            LLMConfigurationError: If the LLM cannot be initialised.
            LLMProviderError: If the LLM provider returns an error.
        """
        ...
