"""
Use-case input DTOs for the video domain.
These are the public API of the use cases — what callers (presentation layer) pass in.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


@dataclass(frozen=True)
class CreateVideoInput:
    """Input for CreateVideoUseCase.execute()."""

    file: Any  # InMemoryUploadedFile or similar
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
