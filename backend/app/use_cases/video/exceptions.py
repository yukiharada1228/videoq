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


class InvalidTagInput(Exception):
    """Raised when tag input violates domain validation rules."""

    def __init__(self, message: str):
        super().__init__(message)


class TranscriptionTargetMissing(Exception):
    """Raised when transcription target video cannot be resolved."""

    def __init__(self, video_id: int):
        self.video_id = video_id
        super().__init__(f"Video {video_id} not found")


class TranscriptionExecutionFailed(Exception):
    """Raised when transcription processing fails inside the use-case boundary."""

    def __init__(self, video_id: int, reason: str):
        self.video_id = video_id
        self.reason = reason
        super().__init__(f"Transcription failed for video {video_id}: {reason}")


class IndexingTargetMissing(Exception):
    """Raised when the video to index cannot be found or has no transcript."""

    def __init__(self, video_id: int):
        self.video_id = video_id
        super().__init__(f"Video {video_id} not found or has no transcript")


class IndexingExecutionFailed(Exception):
    """Raised when vector indexing fails inside the use-case boundary."""

    def __init__(self, video_id: int, reason: str):
        self.video_id = video_id
        self.reason = reason
        super().__init__(f"Indexing failed for video {video_id}: {reason}")


__all__ = [
    "GroupVideoOrderMismatch",
    "IndexingExecutionFailed",
    "IndexingTargetMissing",
    "InvalidTagInput",
    "PermissionDenied",
    "ResourceNotFound",
    "TranscriptionExecutionFailed",
    "TranscriptionTargetMissing",
    "VideoAlreadyInGroup",
    "VideoLimitExceeded",
    "VideoNotInGroup",
]
