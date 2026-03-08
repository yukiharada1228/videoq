"""
Domain entities for the chat domain.
Pure Python dataclasses — no Django/ORM dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

from app.domain.chat.dtos import RelatedVideoDTO
from app.domain.chat.exceptions import FeedbackAccessDenied, InvalidFeedbackValue
from app.domain.chat.value_objects import (
    ChatSceneLog,
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
    share_token: Optional[str] = None
    members: List[VideoGroupMemberRef] = field(default_factory=list)

    @property
    def member_video_ids(self) -> List[int]:
        return [m.video_id for m in self.members]

@dataclass
class ChatLogEntity:
    """Represents a chat log entry in the domain."""

    id: int
    user_id: int
    group_id: int
    group_user_id: int
    group_share_token: Optional[str]
    question: str
    answer: str
    related_videos: List[RelatedVideoDTO] = field(default_factory=list)
    is_shared_origin: bool = False
    feedback: Optional[str] = None
    created_at: Optional[datetime] = None

    @staticmethod
    def validate_feedback_value(feedback: Optional[str]) -> None:
        if feedback not in {None, "good", "bad"}:
            raise InvalidFeedbackValue("feedback must be 'good', 'bad', or null (unspecified)")

    def assert_feedback_access(
        self,
        *,
        user_id: Optional[int] = None,
        share_token: Optional[str] = None,
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
    The use case applies domain services (keyword extraction, scene aggregation) on top of this.
    """

    total: int
    first_date: Optional[datetime]
    last_date: Optional[datetime]
    logs_for_scenes: List[ChatSceneLog]
    time_series: List[TimeSeriesPoint]
    feedback: FeedbackSummary
    questions: List[str]
