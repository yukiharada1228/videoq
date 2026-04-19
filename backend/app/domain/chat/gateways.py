"""
Gateway interfaces for the chat domain.
Abstract contracts for external services used by chat use cases.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Iterator, Optional, Sequence

from app.domain.chat.dtos import ChatMessageDTO, CitationDTO


class LLMConfigurationError(Exception):
    """Raised when the LLM cannot be configured (missing/invalid API key, unknown provider)."""


class LLMProviderError(Exception):
    """Raised when the LLM provider returns an error during generation."""


class RagUserNotFoundError(Exception):
    """Raised when the user context required by RAG does not exist."""


@dataclass
class RagResult:
    """Result returned from the RAG gateway."""

    content: str
    query_text: str
    citations: Optional[Sequence[CitationDTO]] = field(default=None)


@dataclass
class RagStreamChunk:
    """A single chunk emitted during streaming from the RAG gateway.

    Content chunks have ``text`` set.
    The final chunk has ``is_final=True`` and carries ``citations`` / ``query_text``.
    """

    text: Optional[str] = None
    citations: Optional[Sequence[CitationDTO]] = field(default=None)
    query_text: Optional[str] = None
    is_final: bool = False


class RagGateway(ABC):
    """Abstract interface for the RAG (Retrieval-Augmented Generation) service."""

    @abstractmethod
    def generate_reply(
        self,
        messages: Sequence[ChatMessageDTO],
        user_id: int,
        video_ids: Optional[Sequence[int]] = None,
        locale: Optional[str] = None,
        api_key: Optional[str] = None,
        group_context: Optional[str] = None,
    ) -> RagResult:
        """
        Execute the RAG pipeline and return the assistant's reply.

        Args:
            messages: Conversation history as typed DTO messages.
            user_id: ID of the user making the request (for retrieval scoping).
            video_ids: Optional list of video IDs to scope retrieval to.
            locale: Accept-Language locale string for response language hints.

        Returns:
            RagResult with content, query_text, and optional citations.

        Raises:
            RagUserNotFoundError: If the user context does not exist.
            LLMConfigurationError: If the LLM cannot be initialised.
            LLMProviderError: If the LLM provider returns an error.
        """
        ...

    def stream_reply(
        self,
        messages: Sequence[ChatMessageDTO],
        user_id: int,
        video_ids: Optional[Sequence[int]] = None,
        locale: Optional[str] = None,
        api_key: Optional[str] = None,
        group_context: Optional[str] = None,
    ) -> Iterator[RagStreamChunk]:
        """Stream the RAG reply token by token.

        Yields ``RagStreamChunk`` objects:
        - Content chunks have ``text`` set (non-empty string).
        - The final chunk has ``is_final=True`` and carries ``citations`` / ``query_text``.

        Raises:
            RagUserNotFoundError: If the user context does not exist.
            LLMConfigurationError: If the LLM cannot be initialised.
            LLMProviderError: If the LLM provider returns an error during generation.
        """
        raise NotImplementedError("stream_reply is not implemented for this gateway")
