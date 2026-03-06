"""
Domain entities for the video domain.
Pure Python dataclasses — no Django/ORM dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

from app.domain.video.exceptions import ShareLinkNotFound


@dataclass
class TagEntity:
    """Represents a tag in the domain."""

    id: int
    user_id: int
    name: str
    color: str
    video_count: int = 0
    created_at: Optional[datetime] = None
    videos: List["VideoEntity"] = field(default_factory=list)

    @property
    def pk(self) -> int:
        return self.id


@dataclass
class VideoEntity:
    """Represents a video in the domain."""

    id: int
    user_id: int
    title: str
    status: str
    description: str = ""
    file_key: Optional[str] = None  # storage path persisted in repository
    error_message: Optional[str] = None
    uploaded_at: Optional[datetime] = None
    transcript: Optional[str] = None
    tags: List[TagEntity] = field(default_factory=list)

    @property
    def pk(self) -> int:
        return self.id

    # ------------------------------------------------------------------
    # Status transition methods
    # ------------------------------------------------------------------

    def _get_video_status(self) -> "VideoStatus":
        """Return the current status as a VideoStatus enum value."""
        from app.domain.video.status import VideoStatus

        return VideoStatus.from_value(self.status)

    def start_processing(self) -> None:
        """Transition status to PROCESSING."""
        from app.domain.video.status import VideoStatus

        self._get_video_status().assert_transition_to(VideoStatus.PROCESSING)
        self.status = VideoStatus.PROCESSING.value
        self.error_message = ""

    def complete(self) -> None:
        """Transition status to COMPLETED."""
        from app.domain.video.status import VideoStatus

        self._get_video_status().assert_transition_to(VideoStatus.COMPLETED)
        self.status = VideoStatus.COMPLETED.value
        self.error_message = ""

    def fail(self, error_message: str) -> None:
        """Transition status to ERROR with an error message."""
        from app.domain.video.status import VideoStatus

        self._get_video_status().assert_transition_to(VideoStatus.ERROR)
        self.status = VideoStatus.ERROR.value
        self.error_message = error_message


@dataclass
class VideoGroupMemberEntity:
    """Represents a membership record linking a video to a group."""

    id: int
    group_id: int
    video_id: int
    order: int
    added_at: Optional[datetime] = None
    video: Optional[VideoEntity] = None

    @property
    def pk(self) -> int:
        return self.id


@dataclass
class VideoGroupEntity:
    """Represents a video group in the domain."""

    id: int
    user_id: int
    name: str
    description: str = ""
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    share_token: Optional[str] = None
    video_count: int = 0
    videos: List[VideoEntity] = field(default_factory=list)
    members: List[VideoGroupMemberEntity] = field(default_factory=list)

    @property
    def pk(self) -> int:
        return self.id

    # ------------------------------------------------------------------
    # Share link management
    # ------------------------------------------------------------------

    @property
    def is_shared(self) -> bool:
        """Whether this group has an active share link."""
        return self.share_token is not None

    def enable_sharing(self, token: str) -> None:
        """Set the share token for this group."""
        self.share_token = token

    def disable_sharing(self) -> None:
        """Remove the share token. Raises ShareLinkNotFound if not shared."""
        if not self.is_shared:
            raise ShareLinkNotFound()
        self.share_token = None
