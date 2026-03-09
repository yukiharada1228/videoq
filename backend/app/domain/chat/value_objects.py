"""
Value Objects for the chat domain.
Typed representations of scene references and scene log entries
for analytics computation — no dict key access in domain logic.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from app.domain.chat.exceptions import InvalidFeedbackValue


@dataclass(frozen=True)
class SceneReference:
    """A reference to a specific scene within a video."""

    video_id: int
    title: str
    start_time: str
    end_time: Optional[str]


@dataclass(frozen=True)
class ChatSceneLog:
    """A single chat log entry's scene data for analytics aggregation."""

    question: str
    related_videos: List[SceneReference] = field(default_factory=list)


@dataclass(frozen=True)
class TimeSeriesPoint:
    """A single point in chat activity time series."""

    date: str
    count: int


@dataclass(frozen=True)
class FeedbackSummary:
    """Aggregated feedback counts."""

    good: int
    bad: int
    none: int


@dataclass(frozen=True)
class KeywordCount:
    """A keyword and its observed frequency."""

    word: str
    count: int


@dataclass(frozen=True)
class FeedbackValue:
    """Normalized optional feedback value."""

    value: Optional[str]
    _ALLOWED = {"good", "bad"}
    _ERROR_MESSAGE = "feedback must be 'good', 'bad', or null (unspecified)"

    @classmethod
    def normalize_optional(cls, raw: Optional[str]) -> Optional[str]:
        if raw is None:
            return None
        normalized = raw.strip().lower()
        if normalized not in cls._ALLOWED:
            raise InvalidFeedbackValue(cls._ERROR_MESSAGE)
        return normalized
