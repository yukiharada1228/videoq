"""Common DTOs for the agentic chat tool layer (§5.3).

These are infrastructure-internal value objects passed between the agent loop,
the dispatcher, and the tool handlers. ``CitationDTO`` is the domain citation
(4 fields, unchanged); rich citation data lives in ``SceneRef``.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from app.domain.chat.dtos import CitationDTO
from app.infrastructure.external.agentic.scene_ref import SceneRef


@dataclass(frozen=True)
class AgentToolContext:
    """Scope context fixed-injected into every tool call (never LLM-supplied).

    Attributes:
        user_id: Owner user id (from request.user.id). Used for ownership checks.
        video_ids: Member video ids of the current chat group (group boundary).
        locale: Accept-Language locale hint, or None.
    """

    user_id: int
    video_ids: Tuple[int, ...]
    locale: Optional[str]


@dataclass(frozen=True)
class ToolCallResult:
    """Result returned by a single tool handler.

    Attributes:
        content: Body returned to the LLM as a ToolMessage.
        citations: Domain citations produced (search_scenes / get_video).
        retrieved_contexts: Raw text the LLM actually saw (evaluation source).
        scenes: Internal time-stamped citation handles (§8).
    """

    content: str
    citations: List[CitationDTO] = field(default_factory=list)
    retrieved_contexts: List[str] = field(default_factory=list)
    scenes: List[SceneRef] = field(default_factory=list)
