"""
Use-case DTOs for the video domain.
- Input DTOs: public API for callers (presentation layer).
- Response DTOs: output boundary — entities + resolved file_url — consumed by serializers.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, runtime_checkable
from typing import Protocol


@runtime_checkable
class UploadedFile(Protocol):
    """Minimal protocol for an uploaded file object.
    Django's InMemoryUploadedFile satisfies this without modification.
    """
    name: str

    def read(self) -> bytes: ...


@dataclass(frozen=True)
class CreateVideoInput:
    """Input for CreateVideoUseCase.execute()."""

    file: UploadedFile
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


# ---------------------------------------------------------------------------
# Response DTOs (use-case output boundary)
# ---------------------------------------------------------------------------


@dataclass
class VideoResponseDTO:
    """
    Use-case output DTO for a single video.
    Carries all VideoEntity fields plus the resolved file_url.
    Serializers consume this via duck-typed attribute access.
    """

    id: int
    user_id: int
    title: str
    status: str
    description: str = ""
    file_key: Optional[str] = None
    file_url: Optional[str] = None
    error_message: Optional[str] = None
    uploaded_at: Optional[datetime] = None
    transcript: Optional[str] = None
    tags: List = field(default_factory=list)

    @property
    def pk(self) -> int:
        return self.id


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
    Mirrors VideoGroupEntity fields but carries VideoResponseDTO members (with file_url).
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

    @property
    def pk(self) -> int:
        return self.id


@dataclass
class TagDetailResponseDTO:
    """
    Use-case output DTO for tag detail.
    Mirrors TagEntity fields but carries VideoResponseDTO list (with file_url).
    """

    id: int
    user_id: int
    name: str
    color: str
    video_count: int
    created_at: Optional[datetime] = None
    videos: List[VideoResponseDTO] = field(default_factory=list)

    @property
    def pk(self) -> int:
        return self.id
