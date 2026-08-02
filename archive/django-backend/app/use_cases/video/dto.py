"""
Use-case DTOs for the video domain.
- Input DTOs: public API for callers (presentation layer).
- Response DTOs: output boundary for presentation adapters.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from app.domain.video.dto import UploadFileSource


@dataclass(frozen=True)
class RequestUploadInput:
    """Input for RequestVideoUploadUseCase.execute()."""

    filename: str
    content_type: str
    file_size: int
    title: str
    description: str = ""


@dataclass(frozen=True)
class CreateVideoInput:
    """Input for CreateVideoUseCase.execute()."""

    file: UploadFileSource
    title: str
    description: str
    file_size: int = 0


@dataclass(frozen=True)
class CreateYoutubeVideoInput:
    """Input for CreateYoutubeVideoUseCase.execute()."""

    youtube_url: str
    title: str
    description: str = ""


@dataclass(frozen=True)
class UpdateVideoInput:
    """Input for UpdateVideoUseCase.execute() (None = field not provided / skip)."""

    title: str | None = None
    description: str | None = None
    transcript: str | None = None


@dataclass(frozen=True)
class CreateGroupInput:
    """Input for CreateVideoGroupUseCase.execute()."""

    name: str
    description: str = ""


@dataclass(frozen=True)
class UpdateGroupInput:
    """Input for UpdateVideoGroupUseCase.execute() (None = field not provided / skip)."""

    name: str | None = None
    description: str | None = None


@dataclass(frozen=True)
class CreateTagInput:
    """Input for CreateTagUseCase.execute()."""

    name: str
    color: str


@dataclass(frozen=True)
class UpdateTagInput:
    """Input for UpdateTagUseCase.execute() (None = field not provided / skip)."""

    name: str | None = None
    color: str | None = None


@dataclass(frozen=True)
class ListVideosInput:
    """Input for ListVideosUseCase.execute()."""

    keyword: str = ""
    status_filter: str = ""
    sort_key: str = ""
    tag_ids: list[int] | None = None


# ---------------------------------------------------------------------------
# Response DTOs (use-case output boundary)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TagResponseDTO:
    """Use-case output DTO for a tag attached to a video."""

    id: int
    user_id: int
    name: str
    color: str
    video_count: int = 0
    created_at: datetime | None = None


@dataclass
class VideoResponseDTO:
    """
    Use-case output DTO for a single video.
    Carries all video fields for presentation adapters.
    """

    id: int
    user_id: int
    title: str
    status: str
    description: str = ""
    source_type: str = "uploaded"
    file_key: str | None = None
    source_url: str | None = None
    youtube_video_id: str | None = None
    error_message: str | None = None
    uploaded_at: datetime | None = None
    transcript: str | None = None
    tags: list[TagResponseDTO] = field(default_factory=list)


@dataclass(frozen=True)
class VideoListPageResponseDTO:
    """Use-case output DTO for a paginated video list."""

    count: int
    results: list[VideoResponseDTO]


@dataclass(frozen=True)
class UploadRequestResponseDTO:
    """Output for RequestVideoUploadUseCase — video record + presigned upload URL."""

    video: VideoResponseDTO
    upload_url: str


@dataclass
class VideoGroupMemberResponseDTO:
    """Use-case output DTO for a group member entry, including the resolved video."""

    id: int
    group_id: int
    video_id: int
    order: int
    added_at: datetime | None = None
    video: VideoResponseDTO | None = None


@dataclass
class VideoGroupDetailResponseDTO:
    """
    Use-case output DTO for video group detail.
    Mirrors VideoGroupEntity fields but carries VideoResponseDTO members.
    """

    id: int
    user_id: int
    name: str
    description: str
    video_count: int
    display_order: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None
    share_slug: str | None = None
    members: list[VideoGroupMemberResponseDTO] = field(default_factory=list)


@dataclass(frozen=True)
class VideoGroupListResponseDTO:
    """Use-case output DTO for video group list items."""

    id: int
    user_id: int
    name: str
    description: str
    video_count: int
    display_order: int = 0
    created_at: datetime | None = None


@dataclass(frozen=True)
class VideoGroupListPageResponseDTO:
    """Use-case output DTO for a paginated video group list."""

    count: int
    results: list[VideoGroupListResponseDTO]


@dataclass
class TagDetailResponseDTO:
    """
    Use-case output DTO for tag detail.
    Mirrors TagEntity fields but carries VideoResponseDTO list.
    """

    id: int
    user_id: int
    name: str
    color: str
    video_count: int
    created_at: datetime | None = None
    videos: list[VideoResponseDTO] = field(default_factory=list)
