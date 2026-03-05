"""
Domain entities for the video domain.
Pure Python dataclasses — no Django/ORM dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional


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

    @property
    def pk(self) -> int:
        return self.id


@dataclass
class VideoEntity:
    """Represents a video in the domain."""

    id: int
    user_id: int
    title: str
    status: str
    description: str = ""
    file_key: Optional[str] = None  # storage path persisted in repository
    file_url: Optional[str] = None  # public URL resolved in use cases
    error_message: Optional[str] = None
    uploaded_at: Optional[datetime] = None
    transcript: Optional[str] = None
    tags: List[TagEntity] = field(default_factory=list)

    @property
    def pk(self) -> int:
        return self.id


@dataclass
class VideoGroupMemberEntity:
    """Represents a membership record linking a video to a group."""

    id: int
    group_id: int
    video_id: int
    order: int
    added_at: Optional[datetime] = None
    video: Optional[VideoEntity] = None

    @property
    def pk(self) -> int:
        return self.id


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
    def pk(self) -> int:
        return self.id
