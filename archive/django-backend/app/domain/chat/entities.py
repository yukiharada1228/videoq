"""
Domain entities for the chat domain.
Pure Python dataclasses — no Django/ORM dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.domain.chat.dtos import CitationDTO
from app.domain.chat.exceptions import FeedbackAccessDenied, InvalidFeedbackValue
from app.domain.chat.value_objects import (
    FeedbackSummary,
    TimeSeriesPoint,
)


@dataclass
class VideoGroupMemberRef:
    """Lightweight reference to a video group member (for RAG/context use)."""

    video_id: int


@dataclass
class VideoGroupContextEntity:
    """
    Represents a video group in the context of a chat session.
    Contains enough data for group resolution, access control, and RAG retrieval.
    """

    id: int
    user_id: int
    name: str
    description: str = ""
    share_token: str | None = None
    members: list[VideoGroupMemberRef] = field(default_factory=list)

    @property
    def member_video_ids(self) -> list[int]:
        return [m.video_id for m in self.members]

@dataclass
class ChatLogEntity:
    """Represents a chat log entry in the domain."""

    id: int
    user_id: int
    group_id: int
    group_user_id: int
    group_share_token: str | None
    question: str
    answer: str
    citations: list[CitationDTO] = field(default_factory=list)
    retrieved_contexts: list[str] = field(default_factory=list)
    is_shared_origin: bool = False
    feedback: str | None = None
    created_at: datetime | None = None

    @staticmethod
    def validate_feedback_value(feedback: str | None) -> None:
        if feedback not in {None, "good", "bad"}:
            raise InvalidFeedbackValue("feedback must be 'good', 'bad', or null (unspecified)")

    def assert_feedback_access(
        self,
        *,
        user_id: int | None = None,
        share_token: str | None = None,
    ) -> None:
        if share_token:
            if self.group_share_token != share_token:
                raise FeedbackAccessDenied("Share token mismatch")
            return
        if self.group_user_id != user_id:
            raise FeedbackAccessDenied("No permission to access this history")

@dataclass
class ChatAnalyticsRaw:
    """
    Raw data bundle collected from the persistence layer for analytics computation.
    """

    total: int
    first_date: datetime | None
    last_date: datetime | None
    time_series: list[TimeSeriesPoint]
    feedback: FeedbackSummary
