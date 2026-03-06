"""
Domain ports for the video domain.
Abstractions for external capabilities that are not repositories.
"""

from abc import ABC, abstractmethod
from typing import Optional


class FileUrlResolver(ABC):
    """Resolves a storage file key (path) to a publicly accessible URL."""

    @abstractmethod
    def resolve(self, file_key: str) -> Optional[str]:
        """Return the URL for the given storage key, or None on failure."""
        ...
