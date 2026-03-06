"""
Domain entities for the auth domain.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

ACCESS_LEVEL_ALL = "all"
ACCESS_LEVEL_READ_ONLY = "read_only"


@dataclass
class ApiKeyEntity:
    id: int
    name: str
    prefix: str
    access_level: str
    last_used_at: Optional[datetime]
    created_at: datetime
    revoked_at: Optional[datetime] = None

    @property
    def is_revoked(self) -> bool:
        """Whether this API key has been revoked."""
        return self.revoked_at is not None

    @property
    def is_active(self) -> bool:
        """Whether this API key is currently active (not revoked)."""
        return not self.is_revoked


@dataclass
class ApiKeyCreateResult:
    api_key: ApiKeyEntity
    raw_key: str

