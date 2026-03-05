"""
Port interfaces for auth token and credential operations.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class TokenPairDto:
    access: str
    refresh: str


class UserAuthGateway(ABC):
    """Abstract interface for credential authentication."""

    @abstractmethod
    def authenticate(self, username: str, password: str) -> Optional[int]:
        """Return user_id if credentials are valid, None otherwise."""
        ...


class TokenGateway(ABC):
    """Abstract interface for JWT token operations."""

    @abstractmethod
    def issue_for_user(self, user_id: int) -> TokenPairDto:
        """Issue a new access/refresh token pair for the given user."""
        ...

    @abstractmethod
    def refresh(self, refresh_token: str) -> TokenPairDto:
        """Return a new access token from a valid refresh token string."""
        ...
