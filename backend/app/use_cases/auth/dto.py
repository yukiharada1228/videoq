"""DTOs for auth use cases."""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


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
    video_count: int
    max_video_upload_size_mb: int = 500


@dataclass(frozen=True)
class ResolvedShareTokenOutput:
    """Use-case output DTO for resolved share-token auth context."""

    share_token: str
    group_id: int


@dataclass(frozen=True)
class ResolvedApiKeyOutput:
    """Use-case output DTO for resolved API-key auth context."""

    api_key_id: int
    user_id: int
    access_level: str
