"""DTOs for chat gateway boundaries."""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ChatMessageDTO:
    """Typed message entry passed to the chat gateway."""

    role: str
    content: str

    @staticmethod
    def from_dict(raw: dict) -> "ChatMessageDTO":
        return ChatMessageDTO(
            role=str(raw.get("role", "")),
            content=str(raw.get("content", "")),
        )

    def to_dict(self) -> dict:
        return {"role": self.role, "content": self.content}


@dataclass(frozen=True)
class RelatedVideoDTO:
    """Typed related-video entry returned by the chat gateway."""

    video_id: str
    title: str
    start_time: Optional[str]
    end_time: Optional[str]

    @staticmethod
    def from_dict(raw: dict) -> "RelatedVideoDTO":
        return RelatedVideoDTO(
            video_id=str(raw.get("video_id", "")),
            title=str(raw.get("title", "")),
            start_time=raw.get("start_time"),
            end_time=raw.get("end_time"),
        )

    def to_dict(self) -> dict:
        return {
            "video_id": self.video_id,
            "title": self.title,
            "start_time": self.start_time,
            "end_time": self.end_time,
        }
