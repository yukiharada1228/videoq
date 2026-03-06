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

    video_id: int
    title: str
    start_time: Optional[str]
    end_time: Optional[str]

    @staticmethod
    def from_dict(raw: dict) -> "RelatedVideoDTO":
        raw_video_id = raw.get("video_id", 0)
        return RelatedVideoDTO(
            video_id=int(raw_video_id) if raw_video_id else 0,
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
