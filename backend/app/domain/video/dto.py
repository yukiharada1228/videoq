"""
Domain DTOs for video repository port contracts.
No Django / ORM / external service dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Protocol, runtime_checkable


@runtime_checkable
class UploadFileSource(Protocol):
    """Minimal uploaded file contract accepted by repository create APIs."""

    name: str

    def read(self, size: int = -1) -> bytes: ...


@dataclass(frozen=True)
class VideoSearchCriteria:
    """
    Query object for VideoRepository.list_for_user.
    Groups all filtering / ordering options into a single, intention-revealing parameter
    instead of a flat list of keyword arguments.
    """

    keyword: str = ""
    status_filter: str = ""
    sort_key: str = ""
    tag_ids: Optional[List[int]] = field(default=None)


@dataclass(frozen=True)
class CreateVideoParams:
    """Parameters for creating a new video record."""

    upload_file: UploadFileSource
    title: str
    description: str


@dataclass(frozen=True)
class CreateVideoPendingParams:
    """Parameters for creating a video record with file key only (presigned upload)."""

    file_key: str
    title: str
    description: str = ""


@dataclass(frozen=True)
class CreateYoutubeVideoParams:
    """Parameters for creating a YouTube-backed video record."""

    source_url: str
    youtube_video_id: str
    title: str
    description: str = ""


@dataclass(frozen=True)
class UpdateVideoParams:
    """Parameters for updating a video record (None = field not provided / skip)."""

    title: Optional[str] = None
    description: Optional[str] = None


@dataclass(frozen=True)
class CreateGroupParams:
    """Parameters for creating a new video group."""

    name: str
    description: str = ""


@dataclass(frozen=True)
class UpdateGroupParams:
    """Parameters for updating a video group (None = field not provided / skip)."""

    name: Optional[str] = None
    description: Optional[str] = None


@dataclass(frozen=True)
class CreateTagParams:
    """Parameters for creating a new tag."""

    name: str
    color: str


@dataclass(frozen=True)
class UpdateTagParams:
    """Parameters for updating a tag (None = field not provided / skip)."""

    name: Optional[str] = None
    color: Optional[str] = None
