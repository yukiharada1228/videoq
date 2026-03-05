"""
Output DTOs for chat use cases.
Decouples business logic output from HTTP response formatting.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional


@dataclass
class ChatHistoryExportRow:
    """A single row of chat history returned by ExportChatHistoryUseCase."""

    created_at: datetime
    question: str
    answer: str
    is_shared_origin: bool
    related_videos: list
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
    date_range: dict  # {"first": iso_str|None, "last": iso_str|None} or {}
    scene_distribution: List[SceneDistributionItemDTO]
    time_series: list
    feedback: dict
    keywords: list
