"""
Domain entity for the user context.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class UserEntity:
    id: int
    username: str
    email: str
    is_active: bool
    max_video_upload_size_mb: int = 500
    video_count: int = field(default=0)
    storage_limit_gb: Optional[float] = None
    processing_limit_minutes: int = 0
    ai_answers_limit: int = 0
    used_storage_bytes: int = 0
    used_processing_seconds: int = 0
    used_ai_answers: int = 0
    unlimited_processing_minutes: bool = False
    unlimited_ai_answers: bool = False
    is_over_quota: bool = False
    searchapi_api_key: Optional[str] = None

    def get_max_upload_size_bytes(self) -> int:
        return self.max_video_upload_size_mb * 1024 * 1024
