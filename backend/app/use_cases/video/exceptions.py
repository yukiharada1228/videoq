"""Domain exceptions for the video use cases."""

# ResourceNotFound and PermissionDenied are shared across contexts.
# Re-exported here for backward compatibility with video use cases.
from app.domain.video.exceptions import (
    GroupVideoOrderMismatch,
    SomeTagsNotFound,
    SomeVideosNotFound,
    TagNotAttachedToVideo,
    VideoAlreadyInGroup,
    VideoLimitExceeded,
    VideoNotInGroup,
)
from app.use_cases.shared.exceptions import PermissionDenied, ResourceNotFound

__all__ = [
    "GroupVideoOrderMismatch",
    "PermissionDenied",
    "ResourceNotFound",
    "SomeTagsNotFound",
    "SomeVideosNotFound",
    "TagNotAttachedToVideo",
    "VideoAlreadyInGroup",
    "VideoLimitExceeded",
    "VideoNotInGroup",
]
