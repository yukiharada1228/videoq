"""
Gateway interfaces for the auth domain.
Abstract contracts for external services used by auth use cases.
"""

from abc import ABC, abstractmethod
from typing import Optional


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
    def deactivate_user(self, user_id: int, suffix: str) -> None:
        """
        Deactivate the user account: set is_active=False, anonymize username/email.

        Args:
            user_id: ID of the user to deactivate.
            suffix: Timestamp suffix for unique username/email generation.
        """
        ...


class UserManagementGateway(ABC):
    """Abstract interface for user lifecycle operations."""

    @abstractmethod
    def email_exists(self, email: str) -> bool:
        """Return True if a user with the given email already exists."""
        ...

    @abstractmethod
    def create_inactive_user(self, username: str, email: str, password: str) -> int:
        """Create an inactive user and return the new user_id."""
        ...

    @abstractmethod
    def activate_user(self, user_id: int) -> None:
        """Set is_active=True for the given user."""
        ...

    @abstractmethod
    def get_user_id_by_uid_token(self, uidb64: str, token: str) -> Optional[int]:
        """
        Decode uidb64 and validate token.
        Returns user_id if valid, None otherwise.
        """
        ...

    @abstractmethod
    def find_active_user_id_by_email(self, email: str) -> Optional[int]:
        """Return the user_id of an active user with the given email, or None."""
        ...

    @abstractmethod
    def set_password(self, user_id: int, new_password: str) -> None:
        """Update the password for the given user."""
        ...


class EmailSenderGateway(ABC):
    """Abstract interface for sending auth-related emails."""

    @abstractmethod
    def send_verification(self, user_id: int) -> None:
        """Send an email-verification link to the user."""
        ...

    @abstractmethod
    def send_password_reset(self, user_id: int) -> None:
        """Send a password-reset link to the user."""
        ...
