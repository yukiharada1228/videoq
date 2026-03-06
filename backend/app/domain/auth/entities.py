"""
Domain entities for the auth domain.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from app.contracts.auth import ACCESS_LEVEL_ALL, ACCESS_LEVEL_READ_ONLY


@dataclass
class ApiKeyEntity:
    id: int
    name: str
    prefix: str
    access_level: str
    last_used_at: Optional[datetime]
    created_at: datetime
    revoked_at: Optional[datetime] = None


@dataclass
class ApiKeyCreateResult:
    api_key: ApiKeyEntity
    raw_key: str
