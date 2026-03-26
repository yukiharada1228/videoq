"""DTOs for auth boundaries."""

from dataclasses import dataclass


@dataclass
class TokenPairDto:
    access: str
    refresh: str


@dataclass
class ShareAuthContextDTO:
    share_token: str
    group_id: int


@dataclass
class ApiKeyAuthContextDTO:
    api_key_id: int
    user_id: int
    access_level: str
