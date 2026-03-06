"""Application-level exceptions exposed by video use cases."""

from app.use_cases.shared.exceptions import PermissionDenied, ResourceNotFound


class VideoLimitExceeded(Exception):
    """Raised when a user has reached their video upload limit."""

    def __init__(self, limit: int):
        self.limit = limit
        super().__init__(
            f"Video upload limit reached. You can upload up to {limit} video(s)."
        )


class VideoAlreadyInGroup(Exception):
    """Raised when adding a video already included in the target group."""

    def __init__(self, message: str = "This video is already added to the group"):
        super().__init__(message)


class VideoNotInGroup(Exception):
    """Raised when removing a video not included in the target group."""

    def __init__(self, message: str = "This video is not added to the group"):
        super().__init__(message)


class GroupVideoOrderMismatch(Exception):
    """Raised when provided video order does not match group membership."""

    def __init__(
        self, message: str = "Specified video IDs do not match videos in group"
    ):
        super().__init__(message)


__all__ = [
    "GroupVideoOrderMismatch",
    "PermissionDenied",
    "ResourceNotFound",
    "VideoAlreadyInGroup",
    "VideoLimitExceeded",
    "VideoNotInGroup",
]
