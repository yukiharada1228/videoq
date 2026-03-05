"""
Domain DTOs for video repository port contracts.
No Django / ORM / external service dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.domain.video.types import UploadedFileLike


@dataclass(frozen=True)
class CreateVideoParams:
    """Parameters for creating a new video record."""

    file: UploadedFileLike
    title: str
    description: str


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
