"""
Domain services for the video domain.
Pure business logic with no external dependencies.
"""

import re
import secrets

from app.domain.video.exceptions import (
    InvalidShareSlug,
    InvalidTagColor,
    InvalidTagName,
    ReservedShareSlug,
)
from app.domain.video.entities import VideoGroupEntity
from app.domain.video.status import VideoStatus


class ShareLinkService:
    """Domain service for managing video group share links."""

    @staticmethod
    def generate_token() -> str:
        """Generate a cryptographically secure URL-safe share token."""
        return secrets.token_urlsafe(32)


class ShareSlugPolicy:
    """Domain policy for validating and normalizing share slugs."""

    _SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    _RESERVED_SLUGS = {
        "about",
        "admin",
        "api",
        "help",
        "login",
        "settings",
        "share",
        "signup",
    }

    @classmethod
    def normalize(cls, share_slug: str) -> str:
        normalized = share_slug.strip().lower()
        if not normalized:
            raise InvalidShareSlug()
        if len(normalized) < 3 or len(normalized) > 64:
            raise InvalidShareSlug()
        if "--" in normalized:
            raise InvalidShareSlug()
        if not cls._SLUG_PATTERN.fullmatch(normalized):
            raise InvalidShareSlug()
        if normalized in cls._RESERVED_SLUGS:
            raise ReservedShareSlug()
        return normalized


class VideoTranscriptionLifecycle:
    """Domain policy for video transcription status transitions."""

    @staticmethod
    def plan_start(current_status: str) -> tuple[VideoStatus, VideoStatus]:
        from_status = VideoStatus.from_value(current_status)
        to_status = VideoStatus.PROCESSING
        from_status.assert_transition_to(to_status)
        return from_status, to_status

    @staticmethod
    def plan_success() -> tuple[VideoStatus, VideoStatus]:
        from_status = VideoStatus.PROCESSING
        to_status = VideoStatus.INDEXING
        from_status.assert_transition_to(to_status)
        return from_status, to_status

    @staticmethod
    def plan_failure() -> tuple[VideoStatus, VideoStatus]:
        from_status = VideoStatus.PROCESSING
        to_status = VideoStatus.ERROR
        from_status.assert_transition_to(to_status)
        return from_status, to_status


class VideoGroupMembershipService:
    """Domain policy for validating and planning group membership changes."""

    @staticmethod
    def ensure_can_add_video(*, group: VideoGroupEntity, video_id: int) -> None:
        group.assert_can_add_video(video_id)

    @staticmethod
    def ensure_contains_video(*, group: VideoGroupEntity, video_id: int) -> None:
        group.assert_contains_video(video_id)

    @staticmethod
    def ensure_reorder_matches_members(
        *, group: VideoGroupEntity, requested_video_ids: list[int]
    ) -> None:
        group.assert_reorder_matches_members(requested_video_ids)

    @staticmethod
    def plan_bulk_add(
        *,
        group: VideoGroupEntity,
        requested_video_ids: list[int],
        existing_video_ids: set[int],
    ) -> tuple[list[int], int]:
        return group.plan_bulk_add_with_existing(
            requested_video_ids=requested_video_ids,
            existing_video_ids=existing_video_ids,
        )


class TagPolicy:
    """Domain policy for tag normalization and validation."""

    _HEX_COLOR_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")

    @staticmethod
    def normalize_name(name: str) -> str:
        normalized = name.strip()
        if not normalized:
            raise InvalidTagName()
        return normalized

    @classmethod
    def normalize_optional_name(cls, name: str | None) -> str | None:
        if name is None:
            return None
        return cls.normalize_name(name)

    @classmethod
    def validate_color(cls, color: str) -> str:
        if not cls._HEX_COLOR_PATTERN.match(color):
            raise InvalidTagColor()
        return color

    @classmethod
    def validate_optional_color(cls, color: str | None) -> str | None:
        if color is None:
            return None
        return cls.validate_color(color)
