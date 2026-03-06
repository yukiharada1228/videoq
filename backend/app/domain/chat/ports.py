"""
Port interfaces for the chat domain.
Abstractions over external capabilities used by chat use cases.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional


class KeywordExtractor(ABC):
    """Port: extract top keywords from a list of question strings."""

    @abstractmethod
    def extract(self, questions: List[str], limit: int = 30) -> List[Dict]:
        """
        Args:
            questions: Raw question strings to analyse.
            limit: Maximum number of keywords to return.

        Returns:
            List of {"word": str, "count": int} dicts ordered by frequency.
        """
        ...


class SceneVideoInfoProvider(ABC):
    """Port: provide scene-related video file URLs scoped to a group owner."""

    @abstractmethod
    def get_file_urls_for_ids(
        self, video_ids: List[int], user_id: int
    ) -> Dict[int, Optional[str]]:
        """Return a mapping of video_id -> file URL (or None when unavailable)."""
        ...
