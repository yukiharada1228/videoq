"""
Domain entities for the auth domain.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from app.domain.auth.scopes import READ_ONLY_ALLOWED_SCOPES

ACCESS_LEVEL_ALL = "all"
ACCESS_LEVEL_READ_ONLY = "read_only"
VALID_ACCESS_LEVELS = {ACCESS_LEVEL_ALL, ACCESS_LEVEL_READ_ONLY}


class DuplicateApiKeyName(ValueError):
    """Raised when trying to create an API key with an already-used active name."""

    def __init__(self, name: str):
        super().__init__(f"An active API key with this name already exists: {name}")


class InvalidApiKeyAccessLevel(ValueError):
    """Raised when an API key access level is not supported by domain policy."""

    def __init__(self, access_level: str):
        super().__init__(f"Unsupported API key access level: {access_level}")


class InvalidApiKeyName(ValueError):
    """Raised when API key name is missing after normalization."""

    def __init__(self):
        super().__init__("API key name is required")


@dataclass
class ApiKeyEntity:
    id: int
    name: str
    prefix: str
    access_level: str
    last_used_at: Optional[datetime]
    created_at: datetime
    revoked_at: Optional[datetime] = None

    def allows_scope(self, required_scope: str) -> bool:
        return is_scope_allowed_for_access_level(self.access_level, required_scope)


@dataclass
class ApiKeyCreateResult:
    api_key: ApiKeyEntity
    raw_key: str


def is_scope_allowed_for_access_level(access_level: str, required_scope: str) -> bool:
    if access_level == ACCESS_LEVEL_ALL:
        return True
    if access_level == ACCESS_LEVEL_READ_ONLY:
        return required_scope in READ_ONLY_ALLOWED_SCOPES
    return False


def assert_api_key_name_available(*, name: str, exists_active_with_name: bool) -> None:
    if exists_active_with_name:
        raise DuplicateApiKeyName(name)


def assert_valid_api_key_access_level(access_level: str) -> None:
    if access_level not in VALID_ACCESS_LEVELS:
        raise InvalidApiKeyAccessLevel(access_level)


def normalize_api_key_name(name: str) -> str:
    normalized = name.strip()
    if not normalized:
        raise InvalidApiKeyName()
    return normalized
