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
    max_video_upload_size_mb: int = 500
    video_count: int = field(default=0)

    def get_max_upload_size_bytes(self) -> int:
        return self.max_video_upload_size_mb * 1024 * 1024
