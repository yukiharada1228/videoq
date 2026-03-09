"""
Domain services for the video domain.
Pure business logic with no external dependencies.
"""

import secrets

from app.domain.video.entities import VideoGroupEntity
from app.domain.video.status import VideoStatus
from app.domain.video.value_objects import GroupName, ShareToken, TagColor, TagName


class ShareLinkService:
    """Domain service for managing video group share links."""

    @staticmethod
    def generate_token() -> str:
        """Generate a cryptographically secure URL-safe share token."""
        return ShareToken.from_raw(secrets.token_urlsafe(32)).value


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

    @staticmethod
    def normalize_name(name: str) -> str:
        return TagName.from_raw(name).value

    @classmethod
    def normalize_optional_name(cls, name: str | None) -> str | None:
        if name is None:
            return None
        return cls.normalize_name(name)

    @classmethod
    def validate_color(cls, color: str) -> str:
        return TagColor.from_raw(color).value

    @classmethod
    def validate_optional_color(cls, color: str | None) -> str | None:
        if color is None:
            return None
        return cls.validate_color(color)


class VideoGroupPolicy:
    """Domain policy for video-group normalization and validation."""

    @staticmethod
    def normalize_name(name: str) -> str:
        return GroupName.from_raw(name).value

    @classmethod
    def normalize_optional_name(cls, name: str | None) -> str | None:
        if name is None:
            return None
        return cls.normalize_name(name)
