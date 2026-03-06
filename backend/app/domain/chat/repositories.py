"""
Abstract repository interfaces for the chat domain.
No Django / ORM / external service dependencies.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Sequence

from app.domain.chat.dtos import RelatedVideoDTO
from app.domain.chat.entities import (
    ChatAnalyticsRaw,
    ChatLogEntity,
    VideoGroupContextEntity,
)
from app.domain.chat.value_objects import ChatSceneLog


class ChatRepository(ABC):
    """Abstract interface for chat log data access."""

    @abstractmethod
    def get_logs_for_group(
        self, group_id: int, ascending: bool = True
    ) -> List[ChatLogEntity]:
        """Retrieve ordered chat logs for a group."""
        ...

    @abstractmethod
    def create_log(
        self,
        user_id: int,
        group_id: int,
        question: str,
        answer: str,
        related_videos: Optional[Sequence[RelatedVideoDTO]],
        is_shared: bool,
    ) -> ChatLogEntity:
        """Persist a new chat log entry."""
        ...

    @abstractmethod
    def get_log_by_id(self, log_id: int) -> Optional[ChatLogEntity]:
        """
        Retrieve a single chat log by its ID.
        Eagerly loads group.share_token and group.user_id for access control.
        """
        ...

    @abstractmethod
    def update_feedback(
        self, log: ChatLogEntity, feedback: Optional[str]
    ) -> ChatLogEntity:
        """Update the feedback field of a chat log."""
        ...

    @abstractmethod
    def get_logs_values_for_group(self, group_id: int) -> List[ChatSceneLog]:
        """Return scene logs (question + related_videos) for analytics aggregation."""
        ...

    @abstractmethod
    def get_analytics_raw(self, group_id: int) -> ChatAnalyticsRaw:
        """
        Fetch all raw data needed for analytics aggregation in a single call.
        Runs aggregation queries at the persistence layer.
        """
        ...


class VideoGroupQueryRepository(ABC):
    """Abstract interface for fetching video groups in chat contexts."""

    @abstractmethod
    def get_with_members(
        self,
        group_id: int,
        user_id: Optional[int] = None,
        share_token: Optional[str] = None,
    ) -> Optional[VideoGroupContextEntity]:
        """
        Fetch a group with its members pre-loaded.

        Filters by user_id or share_token as appropriate.
        Returns None if not found.
        """
        ...
