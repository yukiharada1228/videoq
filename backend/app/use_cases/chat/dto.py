"""
DTOs for chat use cases.
- Input DTOs: public API for callers (presentation layer).
- Output DTOs: decouples business logic output from HTTP response formatting.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Sequence


@dataclass(frozen=True)
class ChatMessageInput:
    """
    Input DTO for a single chat message at the presentation→use_case boundary.
    Presentation constructs this; the use case maps it to ChatMessageDTO internally.
    """

    role: str
    content: str


@dataclass(frozen=True)
class RelatedVideoResponseDTO:
    """Use-case output DTO for a related video reference."""

    video_id: int
    title: str
    start_time: Optional[str]
    end_time: Optional[str]


@dataclass
class SendMessageResultDTO:
    """Use-case output DTO for SendMessageUseCase."""

    content: str
    related_videos: Optional[Sequence[RelatedVideoResponseDTO]]
    chat_log_id: Optional[int]
    feedback: Optional[str]


@dataclass
class ChatHistoryExportRow:
    """A single row of chat history returned by ExportChatHistoryUseCase."""

    created_at: datetime
    question: str
    answer: str
    is_shared_origin: bool
    related_videos: List[RelatedVideoResponseDTO]
    feedback: Optional[str]


@dataclass
class ChatLogResponseDTO:
    """Use-case output DTO for chat history entries."""

    id: int
    group_id: int
    question: str
    answer: str
    related_videos: List[RelatedVideoResponseDTO]
    is_shared_origin: bool
    feedback: Optional[str]
    created_at: Optional[datetime] = None


@dataclass(frozen=True)
class ChatFeedbackResultDTO:
    """Use-case output DTO for feedback updates."""

    id: int
    feedback: Optional[str]


@dataclass
class PopularSceneDTO:
    """A single scene ranked by reference count across a group's chat history."""

    video_id: int
    title: str
    start_time: Optional[str]
    end_time: Optional[str]
    reference_count: int
    file_url: Optional[str]  # resolved URL (or None if unavailable)
    questions: List[str] = field(default_factory=list)


@dataclass
class SceneDistributionItemDTO:
    """A scene entry in the analytics scene distribution."""

    video_id: int
    title: str
    start_time: Optional[str]
    end_time: Optional[str]
    question_count: int


@dataclass
class ChatAnalyticsDTO:
    """Output of GetChatAnalyticsUseCase."""

    total_questions: int
    date_range: "DateRangeDTO"
    scene_distribution: List[SceneDistributionItemDTO]
    time_series: List["TimeSeriesPointDTO"]
    feedback: "FeedbackSummaryDTO"
    keywords: List["KeywordCountDTO"]


@dataclass(frozen=True)
class DateRangeDTO:
    """Date range metadata in ISO format."""

    first: Optional[str]
    last: Optional[str]


@dataclass(frozen=True)
class TimeSeriesPointDTO:
    """A time-series data point for analytics."""

    date: str
    count: int


@dataclass(frozen=True)
class FeedbackSummaryDTO:
    """Feedback counters used in analytics responses."""

    good: int
    bad: int
    none: int


@dataclass(frozen=True)
class KeywordCountDTO:
    """Keyword count pair used in analytics responses."""

    word: str
    count: int
