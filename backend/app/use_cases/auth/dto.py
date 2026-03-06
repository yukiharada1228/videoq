"""DTOs for auth use cases."""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from app.contracts.auth import (
    ACCESS_LEVEL_ALL,
    ACCESS_LEVEL_READ_ONLY,
    SCOPE_READ,
    SCOPE_WRITE,
)


@dataclass(frozen=True)
class TokenPairOutput:
    """Use-case output DTO for access/refresh tokens."""

    access: str
    refresh: str


@dataclass(frozen=True)
class ApiKeyResponseDTO:
    """Use-case output DTO for API key listing payloads."""

    id: int
    name: str
    prefix: str
    access_level: str
    last_used_at: Optional[datetime]
    created_at: datetime


@dataclass(frozen=True)
class ApiKeyCreateResultDTO:
    """Use-case output DTO for API key creation payloads."""

    api_key: ApiKeyResponseDTO
    raw_key: str


@dataclass(frozen=True)
class CurrentUserOutput:
    """Use-case output DTO for the authenticated user profile."""

    id: int
    username: str
    email: str
    is_active: bool
    video_limit: int
    video_count: int
