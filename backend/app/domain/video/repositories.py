"""
Abstract repository interfaces for the video domain.
No Django / ORM / external service dependencies.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Tuple

from app.domain.video.entities import (
    TagEntity,
    VideoEntity,
    VideoGroupEntity,
    VideoGroupMemberEntity,
)


class VideoRepository(ABC):
    """Abstract interface for video data access."""

    @abstractmethod
    def get_by_id(self, video_id: int, user_id: int) -> Optional[VideoEntity]:
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
    ) -> List[VideoEntity]:
        """List videos for a user with optional filters."""
        ...

    @abstractmethod
    def create(self, user_id: int, validated_data: dict) -> VideoEntity:
        """Create a new video record."""
        ...

    @abstractmethod
    def update(self, video: VideoEntity, validated_data: dict) -> VideoEntity:
        """Update an existing video record."""
        ...

    @abstractmethod
    def delete(self, video: VideoEntity) -> None:
        """Delete a video record (including file cleanup after commit)."""
        ...

    @abstractmethod
    def count_for_user(self, user_id: int) -> int:
        """Return the number of videos owned by the user."""
        ...

    @abstractmethod
    def get_file_urls_for_ids(
        self, video_ids: List[int], user_id: int
    ) -> Dict[int, Optional[str]]:
        """Return a mapping of video_id → file URL (or None) for the given IDs."""
        ...


class VideoGroupRepository(ABC):
    """Abstract interface for video group data access."""

    @abstractmethod
    def get_by_id(
        self,
        group_id: int,
        user_id: int,
        include_videos: bool = False,
    ) -> Optional[VideoGroupEntity]:
        """Retrieve a group by ID owned by the given user."""
        ...

    @abstractmethod
    def list_for_user(
        self, user_id: int, annotate_only: bool = False
    ) -> List[VideoGroupEntity]:
        """List video groups for a user."""
        ...

    @abstractmethod
    def create(self, user_id: int, validated_data: dict) -> VideoGroupEntity:
        """Create a new video group."""
        ...

    @abstractmethod
    def update(self, group: VideoGroupEntity, validated_data: dict) -> VideoGroupEntity:
        """Update an existing video group."""
        ...

    @abstractmethod
    def delete(self, group: VideoGroupEntity) -> None:
        """Delete a video group."""
        ...

    @abstractmethod
    def get_by_share_token(self, share_token: str) -> Optional[VideoGroupEntity]:
        """Retrieve a group by its public share token."""
        ...

    @abstractmethod
    def add_video(
        self, group: VideoGroupEntity, video: VideoEntity
    ) -> VideoGroupMemberEntity:
        """Add a single video to a group. Raises ValueError if already a member."""
        ...

    @abstractmethod
    def add_videos_bulk(
        self, group: VideoGroupEntity, video_ids: List[int], user_id: int
    ) -> Tuple[int, int]:
        """
        Add multiple videos to a group, validating ownership, skipping existing members.

        Raises:
            ValueError: If some video_ids don't belong to user_id.

        Returns:
            (added_count, skipped_count)
        """
        ...

    @abstractmethod
    def remove_video(self, group: VideoGroupEntity, video: VideoEntity) -> None:
        """Remove a video from a group. Raises ValueError if not a member."""
        ...

    @abstractmethod
    def reorder_videos(self, group: VideoGroupEntity, video_ids: List[int]) -> None:
        """Reorder videos in a group according to the given ID list."""
        ...

    @abstractmethod
    def update_share_token(
        self, group: VideoGroupEntity, token: Optional[str]
    ) -> None:
        """Set or clear the share token for a group."""
        ...


class TagRepository(ABC):
    """Abstract interface for tag data access."""

    @abstractmethod
    def list_for_user(self, user_id: int) -> List[TagEntity]:
        """List tags for a user."""
        ...

    @abstractmethod
    def get_by_id(self, tag_id: int, user_id: int) -> Optional[TagEntity]:
        """Retrieve a tag by ID owned by the given user."""
        ...

    @abstractmethod
    def create(self, user_id: int, validated_data: dict) -> TagEntity:
        """Create a new tag."""
        ...

    @abstractmethod
    def update(self, tag: TagEntity, validated_data: dict) -> TagEntity:
        """Update an existing tag."""
        ...

    @abstractmethod
    def delete(self, tag: TagEntity) -> None:
        """Delete a tag."""
        ...

    @abstractmethod
    def add_tags_to_video(
        self, video: VideoEntity, tag_ids: List[int]
    ) -> Tuple[int, int]:
        """
        Add tags to a video, skipping already-attached tags.

        Returns:
            (added_count, skipped_count)
        """
        ...

    @abstractmethod
    def remove_tag_from_video(self, video: VideoEntity, tag: TagEntity) -> None:
        """Remove a tag from a video. Raises ValueError if not attached."""
        ...

    @abstractmethod
    def get_with_videos(self, tag_id: int, user_id: int) -> Optional[TagEntity]:
        """Retrieve a tag with its associated videos pre-loaded."""
        ...
