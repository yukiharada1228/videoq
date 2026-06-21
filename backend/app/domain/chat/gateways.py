"""
Gateway interfaces for the chat domain.
Abstract contracts for external services used by chat use cases.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Iterator, List, Optional, Sequence

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
    retrieved_contexts: List[str] = field(default_factory=list)
    tool_trace: List[dict] = field(default_factory=list)


@dataclass
class RagStreamChunk:
    """A single chunk emitted during streaming from the RAG gateway.

    Content chunks have ``text`` set.
    The final chunk has ``is_final=True`` and carries ``citations`` / ``query_text``.
    """

    text: Optional[str] = None
    citations: Optional[Sequence[CitationDTO]] = field(default=None)
    query_text: Optional[str] = None
    retrieved_contexts: List[str] = field(default_factory=list)
    is_final: bool = False
    tool_trace: List[dict] = field(default_factory=list)


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


@dataclass(frozen=True)
class SceneSearchResultDTO:
    """A single scene matched by a semantic scene search.

    Attributes:
        video_id: ID of the video the scene belongs to.
        video_title: Human-readable title of the video.
        start_time: Subtitle-formatted start timestamp (e.g. ``"00:01:23,000"``), if known.
        end_time: Subtitle-formatted end timestamp, if known.
        start_sec: Scene start offset in seconds, if known.
        end_sec: Scene end offset in seconds, if known.
        scene_index: Zero-based index of the scene within the video, if known.
        text: Transcript/subtitle text of the matched scene.
    """

    video_id: int
    video_title: str
    start_time: Optional[str]
    end_time: Optional[str]
    start_sec: Optional[float]
    end_sec: Optional[float]
    scene_index: Optional[int]
    text: str


class SceneSearchGateway(ABC):
    """Abstract interface for semantic scene search over indexed videos.

    Decouples the scene-search use case from any vector-store implementation,
    keeping the use-case layer free of infrastructure dependencies.
    """

    @abstractmethod
    def search(
        self,
        *,
        user_id: int,
        video_ids: Sequence[int],
        query: str,
        k: int,
    ) -> List[SceneSearchResultDTO]:
        """Return up to ``k`` scenes most relevant to ``query``.

        Args:
            user_id: ID of the user making the request (for retrieval scoping).
            video_ids: Video IDs to scope the search to.
            query: Natural-language search query.
            k: Maximum number of scenes to return.

        Returns:
            A list of ``SceneSearchResultDTO`` ordered by relevance.
        """
        ...
