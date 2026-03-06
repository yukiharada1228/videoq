"""
Domain DTOs for video repository port contracts.
No Django / ORM / external service dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional


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

    file_name: str
    file_bytes: bytes
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
