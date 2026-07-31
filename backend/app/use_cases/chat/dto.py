"""
DTOs for chat use cases.
- Input DTOs: public API for callers (presentation layer).
- Output DTOs: decouples business logic output from HTTP response formatting.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class ChatMessageInput:
    """
    Input DTO for a single chat message at the presentation→use_case boundary.
    Presentation constructs this; the use case maps it to ChatMessageDTO internally.
    """

    role: str
    content: str


@dataclass(frozen=True)
class CitationResponseDTO:
    """Use-case output DTO for a citation reference."""

    id: int
    video_id: int
    title: str
    start_time: str | None
    end_time: str | None


@dataclass
class SendMessageResultDTO:
    """Use-case output DTO for SendMessageUseCase."""

    content: str
    citations: Sequence[CitationResponseDTO] | None
    chat_log_id: int | None
    feedback: str | None


@dataclass
class ChatHistoryExportRow:
    """A single row of chat history returned by ExportChatHistoryUseCase."""

    created_at: datetime
    question: str
    answer: str
    is_shared_origin: bool
    citations: list[CitationResponseDTO]
    feedback: str | None


@dataclass
class ChatLogResponseDTO:
    """Use-case output DTO for chat history entries."""

    id: int
    group_id: int
    question: str
    answer: str
    citations: list[CitationResponseDTO]
    is_shared_origin: bool
    feedback: str | None
    created_at: datetime | None = None


@dataclass(frozen=True)
class ChatFeedbackResultDTO:
    """Use-case output DTO for feedback updates."""

    id: int
    feedback: str | None


@dataclass
class ChatAnalyticsDTO:
    """Output of GetChatAnalyticsUseCase."""

    total_questions: int
    date_range: "DateRangeDTO"
    time_series: list["TimeSeriesPointDTO"]
    feedback: "FeedbackSummaryDTO"


@dataclass(frozen=True)
class DateRangeDTO:
    """Date range metadata in ISO format."""

    first: str | None
    last: str | None


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


@dataclass(frozen=True)
class StreamContentChunk:
    """A single content token emitted by stream_execute()."""

    text: str


@dataclass
class StreamDoneEvent:
    """Final event from stream_execute() carrying full result metadata."""

    content: str
    citations: Sequence[CitationResponseDTO] | None
    chat_log_id: int | None
    feedback: str | None
