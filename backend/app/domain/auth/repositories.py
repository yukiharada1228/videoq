"""
Repository interfaces for the auth domain.
"""

from abc import ABC, abstractmethod
from typing import List, Optional

from app.domain.auth.entities import ApiKeyCreateResult, ApiKeyEntity


class ApiKeyRepository(ABC):
    """Abstract interface for API key persistence."""

    @abstractmethod
    def list_for_user(self, user_id: int) -> List[ApiKeyEntity]:
        """Return all active API keys for the given user."""
        ...

    @abstractmethod
    def create_for_user(
        self, user_id: int, name: str, access_level: str
    ) -> ApiKeyCreateResult:
        """Create a new API key and return the entity plus the raw key."""
        ...

    @abstractmethod
    def get_active_by_id(self, key_id: int, user_id: int) -> Optional[ApiKeyEntity]:
        """Return the active API key by ID and user, or None if not found."""
        ...

    @abstractmethod
    def revoke(self, key_id: int, user_id: int) -> bool:
        """Revoke the API key. Returns True if found and revoked, False otherwise."""
        ...

    @abstractmethod
    def exists_active_with_name(self, user_id: int, name: str) -> bool:
        """Return True if an active key with the given name exists for the user."""
        ...
