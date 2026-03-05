"""
Port interfaces for the chat domain.
Abstractions over external capabilities used by chat use cases.
"""

from abc import ABC, abstractmethod
from typing import Dict, List


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
