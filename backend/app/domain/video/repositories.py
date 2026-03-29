"""
Abstract repository interfaces for the video domain.
No Django / ORM / external service dependencies.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Tuple

from app.domain.video.dto import (
    CreateGroupParams,
    CreateTagParams,
    CreateVideoPendingParams,
    CreateVideoParams,
    CreateYoutubeVideoParams,
    UpdateGroupParams,
    UpdateTagParams,
    UpdateVideoParams,
    VideoSearchCriteria,
)
from app.domain.video.status import VideoStatus
from app.domain.video.entities import (
    TagEntity,
    VideoEntity,
    VideoGroupEntity,
    VideoGroupMemberEntity,
)


class VideoQueryRepository(ABC):
    """Read-side video repository operations."""

    @abstractmethod
    def get_by_id(self, video_id: int, user_id: int) -> Optional[VideoEntity]:
        """Retrieve a video by ID owned by the given user."""
        ...

    @abstractmethod
    def list_for_user(
        self,
        user_id: int,
        criteria: Optional[VideoSearchCriteria] = None,
    ) -> List[VideoEntity]:
        """List videos for a user with optional filters."""
        ...

    @abstractmethod
    def count_for_user(self, user_id: int) -> int:
        """Return the number of videos owned by the user."""
        ...

    @abstractmethod
    def get_file_keys_for_ids(
        self, video_ids: List[int], user_id: int
    ) -> Dict[int, Optional[str]]:
        """Return a mapping of video_id → storage file key (or None) for the given IDs."""
        ...

    @abstractmethod
    def get_existing_ids_for_user(self, video_ids: List[int], user_id: int) -> set[int]:
        """Return the subset of given IDs that belong to the user."""
        ...


class VideoCommandRepository(ABC):
    """Write-side video repository operations."""

    @abstractmethod
    def create(self, user_id: int, params: CreateVideoParams) -> VideoEntity:
        """Create a new video record."""
        ...

    @abstractmethod
    def update(self, video: VideoEntity, params: UpdateVideoParams) -> VideoEntity:
        """Update an existing video record."""
        ...

    @abstractmethod
    def create_pending(self, user_id: int, params: CreateVideoPendingParams) -> VideoEntity:
        """Create a video record with file key only (no file upload). Status = uploading."""
        ...

    @abstractmethod
    def create_youtube(self, user_id: int, params: CreateYoutubeVideoParams) -> VideoEntity:
        """Create a YouTube-backed video record."""
        ...

    @abstractmethod
    def delete(self, video: VideoEntity) -> None:
        """Delete a video record (including file cleanup after commit)."""
        ...


class VideoTranscriptionRepository(ABC):
    """Video repository operations dedicated to transcription workflows."""

    @abstractmethod
    def list_completed_with_transcript(self) -> List[VideoEntity]:
        """Return all videos that have completed transcription and have a non-empty transcript."""
        ...

    @abstractmethod
    def get_by_id_for_task(self, video_id: int) -> Optional[VideoEntity]:
        """Retrieve a video by ID without user ownership check (for internal task use)."""
        ...

    @abstractmethod
    def transition_status(
        self,
        video_id: int,
        from_status: VideoStatus,
        to_status: VideoStatus,
        error_message: str = "",
    ) -> None:
        """Transition status atomically while validating current persisted status."""
        ...

    @abstractmethod
    def save_transcript(self, video_id: int, transcript: str) -> None:
        """Persist the transcription result for a video."""
        ...


class VideoRepository(
    VideoQueryRepository,
    VideoCommandRepository,
    VideoTranscriptionRepository,
    ABC,
):
    """Backward-compatible aggregate video repository port."""


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
        self, user_id: int, include_videos: bool = False
    ) -> List[VideoGroupEntity]:
        """List video groups for a user.

        Args:
            include_videos: When True, include member videos in each group.
        """
        ...

    @abstractmethod
    def create(self, user_id: int, params: CreateGroupParams) -> VideoGroupEntity:
        """Create a new video group."""
        ...

    @abstractmethod
    def update(self, group: VideoGroupEntity, params: UpdateGroupParams) -> VideoGroupEntity:
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
        """Add a single video to a group.

        Raises:
            VideoAlreadyInGroup: If the video is already a member of the group.
        """
        ...

    @abstractmethod
    def add_videos_bulk(
        self, group: VideoGroupEntity, video_ids: List[int], user_id: int
    ) -> Tuple[int, int]:
        """
        Persist multiple videos as group members in the given order.
        Business validations (existence/membership) are handled in use cases.

        Returns:
            (added_count, skipped_count)
        """
        ...

    @abstractmethod
    def remove_video(self, group: VideoGroupEntity, video: VideoEntity) -> None:
        """Remove a video from a group.

        Raises:
            VideoNotInGroup: If the video is not a member of the group.
        """
        ...

    @abstractmethod
    def reorder_videos(self, group: VideoGroupEntity, video_ids: List[int]) -> None:
        """Persist video order in a group according to the given ID list."""
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
    def create(self, user_id: int, params: CreateTagParams) -> TagEntity:
        """Create a new tag."""
        ...

    @abstractmethod
    def update(self, tag: TagEntity, params: UpdateTagParams) -> TagEntity:
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

        Raises:
            SomeTagsNotFound: If some tag IDs do not belong to the user.

        Returns:
            (added_count, skipped_count)
        """
        ...

    @abstractmethod
    def remove_tag_from_video(self, video: VideoEntity, tag: TagEntity) -> None:
        """Remove a tag from a video.

        Raises:
            TagNotAttachedToVideo: If the tag is not attached to the video.
        """
        ...

    @abstractmethod
    def get_with_videos(self, tag_id: int, user_id: int) -> Optional[TagEntity]:
        """Retrieve a tag with its associated videos pre-loaded."""
        ...
