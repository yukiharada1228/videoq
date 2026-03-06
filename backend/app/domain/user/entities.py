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

    # ------------------------------------------------------------------
    # Upload limit enforcement
    # ------------------------------------------------------------------

    def can_upload_video(self) -> bool:
        """Return True if the user is allowed to upload another video."""
        if self.video_limit is None:
            return True
        return self.video_count < self.video_limit

    def ensure_can_upload(self) -> None:
        """Raise VideoLimitExceeded if the user has reached their upload limit."""
        from app.domain.video.exceptions import VideoLimitExceeded

        if not self.can_upload_video():
            raise VideoLimitExceeded(self.video_limit)  # type: ignore[arg-type]

