"""
Domain entity for the user context.
"""

from dataclasses import dataclass, field

from app.domain.user.exceptions import UserVideoLimitExceeded


@dataclass
class UserEntity:
    id: int
    username: str
    email: str
    is_active: bool
    video_limit: int | None
    max_video_upload_size_mb: int = 500
    video_count: int = field(default=0)

    def assert_can_upload_video(self, current_count: int | None = None) -> None:
        count = self.video_count if current_count is None else current_count
        if self.video_limit is not None and count >= self.video_limit:
            raise UserVideoLimitExceeded(self.video_limit)

    def get_max_upload_size_bytes(self) -> int:
        return self.max_video_upload_size_mb * 1024 * 1024
