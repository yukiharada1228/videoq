"""
Abstract repository interfaces for the video domain.
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Tuple

from app.models import Tag, Video, VideoGroup, VideoGroupMember


class VideoRepository(ABC):
    """Abstract interface for video data access."""

    @abstractmethod
    def get_by_id(self, video_id: int, user_id: int) -> Optional[Video]:
        """Retrieve a video by ID owned by the given user."""
        ...

    @abstractmethod
    def list_for_user(
        self,
        user_id: int,
        q: str = "",
        status: str = "",
        ordering: str = "",
        tag_ids: Optional[List[int]] = None,
        include_transcript: bool = False,
        include_groups: bool = False,
    ) -> "QuerySet[Video]":
        """List videos for a user with optional filters."""
        ...

    @abstractmethod
    def create(self, user_id: int, validated_data: dict) -> Video:
        """Create a new video record."""
        ...

    @abstractmethod
    def update(self, video: Video, validated_data: dict) -> Video:
        """Update an existing video record."""
        ...

    @abstractmethod
    def delete(self, video: Video) -> None:
        """Delete a video record."""
        ...

    @abstractmethod
    def count_for_user(self, user_id: int) -> int:
        """Return the number of videos owned by the user."""
        ...


class VideoGroupRepository(ABC):
    """Abstract interface for video group data access."""

    @abstractmethod
    def get_by_id(
        self,
        group_id: int,
        user_id: int,
        include_videos: bool = False,
    ) -> Optional[VideoGroup]:
        """Retrieve a group by ID owned by the given user."""
        ...

    @abstractmethod
    def list_for_user(
        self, user_id: int, annotate_only: bool = False
    ) -> "QuerySet[VideoGroup]":
        """List video groups for a user."""
        ...

    @abstractmethod
    def create(self, user_id: int, validated_data: dict) -> VideoGroup:
        """Create a new video group."""
        ...

    @abstractmethod
    def update(self, group: VideoGroup, validated_data: dict) -> VideoGroup:
        """Update an existing video group."""
        ...

    @abstractmethod
    def delete(self, group: VideoGroup) -> None:
        """Delete a video group."""
        ...

    @abstractmethod
    def get_by_share_token(self, share_token: str) -> Optional[VideoGroup]:
        """Retrieve a group by its public share token."""
        ...

    @abstractmethod
    def add_video(self, group: VideoGroup, video: Video) -> VideoGroupMember:
        """Add a single video to a group. Raises ValueError if already a member."""
        ...

    @abstractmethod
    def add_videos_bulk(
        self, group: VideoGroup, videos: List[Video], video_ids: List[int]
    ) -> Tuple[int, int]:
        """
        Add multiple videos to a group, skipping existing members.

        Returns:
            (added_count, skipped_count)
        """
        ...

    @abstractmethod
    def remove_video(self, group: VideoGroup, video: Video) -> None:
        """Remove a video from a group. Raises ValueError if not a member."""
        ...

    @abstractmethod
    def reorder_videos(self, group: VideoGroup, video_ids: List[int]) -> None:
        """Reorder videos in a group according to the given ID list."""
        ...

    @abstractmethod
    def update_share_token(
        self, group: VideoGroup, token: Optional[str]
    ) -> None:
        """Set or clear the share token for a group."""
        ...


class TagRepository(ABC):
    """Abstract interface for tag data access."""

    @abstractmethod
    def list_for_user(self, user_id: int) -> "QuerySet[Tag]":
        """List tags for a user."""
        ...

    @abstractmethod
    def get_by_id(self, tag_id: int, user_id: int) -> Optional[Tag]:
        """Retrieve a tag by ID owned by the given user."""
        ...

    @abstractmethod
    def create(self, user_id: int, validated_data: dict) -> Tag:
        """Create a new tag."""
        ...

    @abstractmethod
    def update(self, tag: Tag, validated_data: dict) -> Tag:
        """Update an existing tag."""
        ...

    @abstractmethod
    def delete(self, tag: Tag) -> None:
        """Delete a tag."""
        ...

    @abstractmethod
    def add_tags_to_video(
        self, video: Video, tag_ids: List[int]
    ) -> Tuple[int, int]:
        """
        Add tags to a video, skipping already-attached tags.

        Returns:
            (added_count, skipped_count)
        """
        ...

    @abstractmethod
    def remove_tag_from_video(self, video: Video, tag: Tag) -> None:
        """Remove a tag from a video. Raises ValueError if not attached."""
        ...
