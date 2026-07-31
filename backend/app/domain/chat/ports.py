"""
Port interfaces for the chat domain.
Abstractions over external capabilities used by chat use cases.
"""

from abc import ABC, abstractmethod

from app.domain.chat.value_objects import KeywordCount


class KeywordExtractor(ABC):
    """Port: extract top keywords from a list of question strings."""

    @abstractmethod
    def extract(self, questions: list[str], limit: int = 30) -> list[KeywordCount]:
        """
        Args:
            questions: Raw question strings to analyse.
            limit: Maximum number of keywords to return.

        Returns:
            List of KeywordCount ordered by frequency.
        """
        ...
