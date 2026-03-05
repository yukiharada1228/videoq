"""
Gateway interfaces for the auth domain.
Abstract contracts for external services used by auth use cases.
"""

from abc import ABC, abstractmethod


class TaskQueueGateway(ABC):
    """Abstract interface for enqueueing async background tasks."""

    @abstractmethod
    def enqueue_transcription(self, video_id: int) -> None:
        """Enqueue a video transcription task (dispatched after DB commit)."""
        ...

    @abstractmethod
    def enqueue_account_deletion(self, user_id: int) -> None:
        """Enqueue a background account data deletion task."""
        ...


class AccountDeletionGateway(ABC):
    """Abstract interface for persisting account deletion records and deactivating users."""

    @abstractmethod
    def record_deletion_request(self, user_id: int, reason: str) -> None:
        """Persist an AccountDeletionRequest record."""
        ...

    @abstractmethod
    def deactivate_user(self, user, suffix: str) -> None:
        """
        Deactivate the user account: set is_active=False, anonymize username/email.

        Args:
            user: The authenticated user object (ORM model, passed in from use case).
            suffix: Timestamp suffix for unique username/email generation.
        """
        ...
