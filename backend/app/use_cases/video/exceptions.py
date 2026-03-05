"""Domain exceptions for the video use cases."""

# ResourceNotFound and PermissionDenied are shared across contexts.
# Re-exported here for backward compatibility with video use cases.
from app.use_cases.shared.exceptions import PermissionDenied, ResourceNotFound

__all__ = ["ResourceNotFound", "PermissionDenied", "VideoLimitExceeded"]


class VideoLimitExceeded(Exception):
    """Raised when a user has reached their video upload limit."""

    def __init__(self, limit: int):
        self.limit = limit
        super().__init__(
            f"Video upload limit reached. You can upload up to {limit} video(s)."
        )
