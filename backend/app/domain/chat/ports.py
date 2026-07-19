"""
Port interfaces for the chat domain.
Abstractions over external capabilities used by chat use cases.
"""

from abc import ABC, abstractmethod
from typing import List

from app.domain.chat.value_objects import KeywordCount


class KeywordExtractor(ABC):
    """Port: extract top keywords from a list of question strings."""

    @abstractmethod
    def extract(self, questions: List[str], limit: int = 30) -> List[KeywordCount]:
        """
        Args:
            questions: Raw question strings to analyse.
            limit: Maximum number of keywords to return.

        Returns:
            List of KeywordCount ordered by frequency.
        """
        ...
