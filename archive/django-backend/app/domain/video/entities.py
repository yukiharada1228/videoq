"""
Domain entities for the video domain.
Pure Python dataclasses — no Django/ORM dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.domain.video.exceptions import (
    GroupVideoOrderMismatch,
    ShareLinkNotActive,
    SomeVideosNotFound,
    TagNotAttachedToVideo,
    VideoAlreadyInGroup,
    VideoNotInGroup,
)


@dataclass
class TagEntity:
    """Represents a tag in the domain."""

    id: int
    user_id: int
    name: str
    color: str
    video_count: int = 0
    created_at: datetime | None = None
    videos: list[VideoEntity] = field(default_factory=list)

@dataclass
class VideoEntity:
    """Represents a video in the domain."""

    id: int
    user_id: int
    title: str
    status: str
    description: str = ""
    source_type: str = "uploaded"
    file_key: str | None = None  # storage path persisted in repository
    source_url: str | None = None
    youtube_video_id: str | None = None
    error_message: str | None = None
    uploaded_at: datetime | None = None
    transcript: str | None = None
    tags: list[TagEntity] = field(default_factory=list)

    def plan_tag_attachment(self, requested_tag_ids: list[int]) -> tuple[list[int], int]:
        """
        Determine which tag IDs should be attached, skipping already-attached
        tags and duplicate IDs in the request.
        """
        ids_to_add: list[int] = []
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
    added_at: datetime | None = None
    video: VideoEntity | None = None

@dataclass
class VideoGroupEntity:
    """Represents a video group in the domain."""

    id: int
    user_id: int
    name: str
    description: str = ""
    display_order: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None
    share_slug: str | None = None
    video_count: int = 0
    videos: list[VideoEntity] = field(default_factory=list)
    members: list[VideoGroupMemberEntity] = field(default_factory=list)

    @property
    def member_video_ids(self) -> list[int]:
        return [member.video_id for member in self.members]

    def contains_video(self, video_id: int) -> bool:
        return video_id in set(self.member_video_ids)

    def assert_can_add_video(self, video_id: int) -> None:
        if self.contains_video(video_id):
            raise VideoAlreadyInGroup()

    def assert_contains_video(self, video_id: int) -> None:
        if not self.contains_video(video_id):
            raise VideoNotInGroup()

    def plan_bulk_add(self, requested_video_ids: list[int]) -> tuple[list[int], int]:
        """
        Determine which IDs should be added, skipping IDs already in the group
        and duplicate IDs in the request.
        """
        ids_to_add: list[int] = []
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
        requested_video_ids: list[int],
        existing_video_ids: set[int],
    ) -> tuple[list[int], int]:
        missing_ids = [
            video_id for video_id in set(requested_video_ids) if video_id not in existing_video_ids
        ]
        if missing_ids:
            raise SomeVideosNotFound()
        return self.plan_bulk_add(requested_video_ids)

    def assert_reorder_matches_members(self, requested_video_ids: list[int]) -> None:
        member_ids = self.member_video_ids
        if len(requested_video_ids) != len(member_ids):
            raise GroupVideoOrderMismatch()
        if set(requested_video_ids) != set(member_ids):
            raise GroupVideoOrderMismatch()

    def assert_share_link_active(self) -> None:
        if not self.share_slug:
            raise ShareLinkNotActive()
