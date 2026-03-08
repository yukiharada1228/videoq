"""
Domain entities for the video domain.
Pure Python dataclasses — no Django/ORM dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Tuple

from app.domain.video.exceptions import (
    GroupVideoOrderMismatch,
    ShareLinkNotActive,
    SomeVideosNotFound,
    TagNotAttachedToVideo,
    VideoLimitExceeded,
)
from app.domain.video.exceptions import VideoAlreadyInGroup, VideoNotInGroup


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

    @staticmethod
    def ensure_upload_within_limit(current_count: int, video_limit: Optional[int]) -> None:
        """Enforce per-user upload limits as a domain invariant."""
        if video_limit is not None and current_count >= video_limit:
            raise VideoLimitExceeded(video_limit)

    def plan_tag_attachment(self, requested_tag_ids: List[int]) -> Tuple[List[int], int]:
        """
        Determine which tag IDs should be attached, skipping already-attached
        tags and duplicate IDs in the request.
        """
        ids_to_add: List[int] = []
        attached_ids = {tag.id for tag in self.tags}
        seen_ids = set(attached_ids)
        for tag_id in requested_tag_ids:
            if tag_id in seen_ids:
                continue
            ids_to_add.append(tag_id)
            seen_ids.add(tag_id)
        skipped_count = len(requested_tag_ids) - len(ids_to_add)
        return ids_to_add, skipped_count

    def assert_has_tag(self, tag_id: int) -> None:
        attached_ids = {tag.id for tag in self.tags}
        if tag_id not in attached_ids:
            raise TagNotAttachedToVideo()


@dataclass
class VideoGroupMemberEntity:
    """Represents a membership record linking a video to a group."""

    id: int
    group_id: int
    video_id: int
    order: int
    added_at: Optional[datetime] = None
    video: Optional[VideoEntity] = None

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
    def member_video_ids(self) -> List[int]:
        return [member.video_id for member in self.members]

    def contains_video(self, video_id: int) -> bool:
        return video_id in set(self.member_video_ids)

    def assert_can_add_video(self, video_id: int) -> None:
        if self.contains_video(video_id):
            raise VideoAlreadyInGroup()

    def assert_contains_video(self, video_id: int) -> None:
        if not self.contains_video(video_id):
            raise VideoNotInGroup()

    def plan_bulk_add(self, requested_video_ids: List[int]) -> Tuple[List[int], int]:
        """
        Determine which IDs should be added, skipping IDs already in the group
        and duplicate IDs in the request.
        """
        ids_to_add: List[int] = []
        seen_ids = set(self.member_video_ids)
        for video_id in requested_video_ids:
            if video_id in seen_ids:
                continue
            ids_to_add.append(video_id)
            seen_ids.add(video_id)
        skipped_count = len(requested_video_ids) - len(ids_to_add)
        return ids_to_add, skipped_count

    def plan_bulk_add_with_existing(
        self,
        *,
        requested_video_ids: List[int],
        existing_video_ids: set[int],
    ) -> Tuple[List[int], int]:
        missing_ids = [
            video_id for video_id in set(requested_video_ids) if video_id not in existing_video_ids
        ]
        if missing_ids:
            raise SomeVideosNotFound()
        return self.plan_bulk_add(requested_video_ids)

    def assert_reorder_matches_members(self, requested_video_ids: List[int]) -> None:
        member_ids = self.member_video_ids
        if len(requested_video_ids) != len(member_ids):
            raise GroupVideoOrderMismatch()
        if set(requested_video_ids) != set(member_ids):
            raise GroupVideoOrderMismatch()

    def assert_share_link_active(self) -> None:
        if not self.share_token:
            raise ShareLinkNotActive()
