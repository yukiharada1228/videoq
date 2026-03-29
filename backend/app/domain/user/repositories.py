"""
Abstract repository interfaces for the user domain.
"""

from abc import ABC, abstractmethod
from typing import Optional

from app.domain.user.entities import UserEntity


class UserRepository(ABC):
    """Abstract interface for user data access."""

    @abstractmethod
    def get_by_id(self, user_id: int) -> Optional[UserEntity]:
        """Retrieve a user by ID."""
        ...

    @abstractmethod
    def get_with_video_count(self, user_id: int) -> Optional[UserEntity]:
        """Retrieve a user annotated with their video count."""
        ...

    @abstractmethod
    def has_searchapi_api_key(self, user_id: int) -> bool:
        """Return whether the user has a SearchAPI API key configured."""
        ...

    @abstractmethod
    def set_searchapi_api_key(self, user_id: int, api_key: str) -> bool:
        """Store or update the user's SearchAPI API key."""
        ...

    @abstractmethod
    def delete_searchapi_api_key(self, user_id: int) -> bool:
        """Delete the user's SearchAPI API key."""
        ...
