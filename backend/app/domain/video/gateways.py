"""
Gateway interfaces for the video domain.
Abstract contracts for external services used by video use cases.
"""

from abc import ABC, abstractmethod


class VectorStoreGateway(ABC):
    """Abstract interface for vector store metadata operations."""

    @abstractmethod
    def update_video_title(self, video_id: int, new_title: str) -> None:
        """Update the video title stored in the vector metadata."""
        ...
