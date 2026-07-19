"""
Value Objects for the chat domain.
"""

from __future__ import annotations

from dataclasses import dataclass


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
