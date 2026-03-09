"""Value objects for the video domain."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.domain.video.exceptions import (
    InvalidGroupName,
    InvalidShareToken,
    InvalidTagColor,
    InvalidTagName,
)


@dataclass(frozen=True)
class TagName:
    """Normalized tag name."""

    value: str

    @classmethod
    def from_raw(cls, raw: str) -> "TagName":
        normalized = raw.strip()
        if not normalized:
            raise InvalidTagName()
        return cls(value=normalized)


@dataclass(frozen=True)
class TagColor:
    """Hex color value for tags."""

    value: str

    _HEX_COLOR_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")

    @classmethod
    def from_raw(cls, raw: str) -> "TagColor":
        if not cls._HEX_COLOR_PATTERN.match(raw):
            raise InvalidTagColor()
        return cls(value=raw)


@dataclass(frozen=True)
class GroupName:
    """Normalized group name."""

    value: str

    @classmethod
    def from_raw(cls, raw: str) -> "GroupName":
        normalized = raw.strip()
        if not normalized:
            raise InvalidGroupName()
        return cls(value=normalized)


@dataclass(frozen=True)
class ShareToken:
    """Normalized non-empty share token."""

    value: str

    @classmethod
    def from_raw(cls, raw: str) -> "ShareToken":
        normalized = raw.strip()
        if not normalized:
            raise InvalidShareToken()
        return cls(value=normalized)

