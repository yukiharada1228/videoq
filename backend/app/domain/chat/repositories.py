"""
Abstract repository interfaces for the chat domain.
"""

from abc import ABC, abstractmethod
from typing import List, Optional

from app.models import ChatLog, VideoGroup


class ChatRepository(ABC):
    """Abstract interface for chat log data access."""

    @abstractmethod
    def get_logs_for_group(
        self, group: VideoGroup, ascending: bool = True
    ) -> "QuerySet[ChatLog]":
        """Retrieve ordered chat logs for a group."""
        ...

    @abstractmethod
    def create_log(
        self,
        user,
        group: VideoGroup,
        question: str,
        answer: str,
        related_videos: List[dict],
        is_shared: bool,
    ) -> ChatLog:
        """Persist a new chat log entry."""
        ...

    @abstractmethod
    def get_log_by_id(self, log_id: int) -> Optional[ChatLog]:
        """Retrieve a single chat log by its ID."""
        ...

    @abstractmethod
    def update_feedback(
        self, log: ChatLog, feedback: Optional[str]
    ) -> ChatLog:
        """Update the feedback field of a chat log."""
        ...

    @abstractmethod
    def get_logs_values_for_group(
        self, group: VideoGroup
    ) -> "QuerySet":
        """Return a values queryset (question, related_videos) for analytics."""
        ...


class VideoGroupQueryRepository(ABC):
    """Abstract interface for fetching video groups in chat contexts."""

    @abstractmethod
    def get_with_members(
        self,
        group_id: int,
        user_id: Optional[int] = None,
        share_token: Optional[str] = None,
    ) -> Optional[VideoGroup]:
        """
        Fetch a group with its members pre-loaded.

        Filters by user_id or share_token as appropriate.
        Returns None if not found.
        """
        ...
