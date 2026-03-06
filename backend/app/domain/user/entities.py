"""
Domain entity for the user context.
"""

from dataclasses import dataclass, field


@dataclass
class UserEntity:
    id: int
    username: str
    email: str
    is_active: bool
    video_limit: int | None
    video_count: int = field(default=0)
