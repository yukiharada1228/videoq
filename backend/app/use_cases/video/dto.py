"""
Use-case DTOs for the video domain.
- Input DTOs: public API for callers (presentation layer).
- Response DTOs: output boundary for presentation adapters.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

from app.domain.video.dto import UploadFileSource


@dataclass(frozen=True)
class CreateVideoInput:
    """Input for CreateVideoUseCase.execute()."""

    file: UploadFileSource
    title: str
    description: str


@dataclass(frozen=True)
class UpdateVideoInput:
    """Input for UpdateVideoUseCase.execute() (None = field not provided / skip)."""

    title: Optional[str] = None
    description: Optional[str] = None


@dataclass(frozen=True)
class CreateGroupInput:
    """Input for CreateVideoGroupUseCase.execute()."""

    name: str
    description: str = ""


@dataclass(frozen=True)
class UpdateGroupInput:
    """Input for UpdateVideoGroupUseCase.execute() (None = field not provided / skip)."""

    name: Optional[str] = None
    description: Optional[str] = None


@dataclass(frozen=True)
class CreateTagInput:
    """Input for CreateTagUseCase.execute()."""

    name: str
    color: str


@dataclass(frozen=True)
class UpdateTagInput:
    """Input for UpdateTagUseCase.execute() (None = field not provided / skip)."""

    name: Optional[str] = None
    color: Optional[str] = None


@dataclass(frozen=True)
class ListVideosInput:
    """Input for ListVideosUseCase.execute()."""

    keyword: str = ""
    status_filter: str = ""
    sort_key: str = ""
    tag_ids: Optional[List[int]] = None


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
    created_at: Optional[datetime] = None


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
    file_key: Optional[str] = None
    error_message: Optional[str] = None
    uploaded_at: Optional[datetime] = None
    transcript: Optional[str] = None
    tags: List[TagResponseDTO] = field(default_factory=list)


@dataclass
class VideoGroupMemberResponseDTO:
    """Use-case output DTO for a group member entry, including the resolved video."""

    id: int
    group_id: int
    video_id: int
    order: int
    added_at: Optional[datetime] = None
    video: Optional[VideoResponseDTO] = None


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
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    share_token: Optional[str] = None
    members: List[VideoGroupMemberResponseDTO] = field(default_factory=list)


@dataclass(frozen=True)
class VideoGroupListResponseDTO:
    """Use-case output DTO for video group list items."""

    id: int
    user_id: int
    name: str
    description: str
    video_count: int
    created_at: Optional[datetime] = None


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
    created_at: Optional[datetime] = None
    videos: List[VideoResponseDTO] = field(default_factory=list)
