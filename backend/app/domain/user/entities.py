"""
Domain entity for the user context.
"""

from dataclasses import dataclass, field

from app.domain.video.exceptions import VideoLimitExceeded


@dataclass
class UserEntity:
    id: int
    username: str
    email: str
    is_active: bool
    video_limit: int | None
    video_count: int = field(default=0)

    def assert_can_upload_video(self, current_count: int | None = None) -> None:
        count = self.video_count if current_count is None else current_count
        if self.video_limit is not None and count >= self.video_limit:
            raise VideoLimitExceeded(self.video_limit)
