"""
Abstract repository interfaces for user-owned secrets.
"""

from abc import ABC, abstractmethod
from typing import Optional


class OpenAiApiKeyRepository(ABC):
    """Abstract interface for managing a user's encrypted OpenAI API key."""

    @abstractmethod
    def save_encrypted_key(self, user_id: int, raw_key: str) -> None:
        """Encrypt and persist the user's OpenAI API key."""
        ...

    @abstractmethod
    def get_decrypted_key(self, user_id: int) -> Optional[str]:
        """Retrieve and decrypt the user's OpenAI API key, or None if not set."""
        ...

    @abstractmethod
    def delete_key(self, user_id: int) -> None:
        """Remove the user's stored OpenAI API key."""
        ...

    @abstractmethod
    def get_masked_key(self, user_id: int) -> Optional[str]:
        """Return a masked representation of the key (e.g. 'sk-...abcd'), or None."""
        ...

    @abstractmethod
    def has_key(self, user_id: int) -> bool:
        """Return True if the user has a stored OpenAI API key."""
        ...
