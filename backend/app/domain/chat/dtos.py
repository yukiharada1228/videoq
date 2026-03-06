"""DTOs for chat gateway boundaries."""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ChatMessageDTO:
    """Typed message entry passed to the chat gateway."""

    role: str
    content: str


@dataclass(frozen=True)
class RelatedVideoDTO:
    """Typed related-video entry returned by the chat gateway."""

    video_id: int
    title: str
    start_time: Optional[str]
    end_time: Optional[str]
