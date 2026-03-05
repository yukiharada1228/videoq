"""
Domain ports for the media domain.
"""

from abc import ABC, abstractmethod
from typing import Optional


class ProtectedMediaRepository(ABC):
    @abstractmethod
    def find_video_id_by_file_path(self, path: str) -> Optional[int]:
        """Return video_id if a video with file=path exists, else None."""

    @abstractmethod
    def is_video_owned_by_user(self, video_id: int, user_id: int) -> bool:
        """Return True if user_id owns video_id."""

    @abstractmethod
    def is_video_in_group(self, video_id: int, group_id: int) -> bool:
        """Return True if group_id has access to video_id."""
