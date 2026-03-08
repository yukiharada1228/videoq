"""Domain exceptions for the video domain."""


class VideoLimitExceeded(Exception):
    """Raised when a user has reached their video upload limit."""

    def __init__(self, limit: int):
        self.limit = limit
        super().__init__(
            f"Video upload limit reached. You can upload up to {limit} video(s)."
        )


class InvalidVideoStatusTransition(Exception):
    """Raised when a requested status transition is not allowed by domain rules."""

    def __init__(self, current_status: str, requested_status: str):
        super().__init__(
            f"Cannot transition video status from '{current_status}' to '{requested_status}'"
        )


class VideoAlreadyInGroup(Exception):
    """Raised when adding a video that is already a member of the target group."""

    def __init__(self, message: str = "This video is already added to the group"):
        super().__init__(message)


class VideoNotInGroup(Exception):
    """Raised when removing a video that is not a member of the target group."""

    def __init__(self, message: str = "This video is not added to the group"):
        super().__init__(message)


class GroupVideoOrderMismatch(Exception):
    """Raised when the provided video order does not match group members."""

    def __init__(
        self, message: str = "Specified video IDs do not match videos in group"
    ):
        super().__init__(message)


class SomeVideosNotFound(Exception):
    """Raised when one or more target videos cannot be resolved."""

    def __init__(self, message: str = "Some videos not found"):
        super().__init__(message)


class SomeTagsNotFound(Exception):
    """Raised when one or more target tags cannot be resolved."""

    def __init__(self, message: str = "Some tags not found"):
        super().__init__(message)


class TagNotAttachedToVideo(Exception):
    """Raised when trying to remove a tag that is not attached to a video."""

    def __init__(self, message: str = "This tag is not attached to the video"):
        super().__init__(message)


class ShareLinkNotActive(Exception):
    """Raised when deleting a share link on a group that has no active token."""

    def __init__(self, message: str = "Share link is not active"):
        super().__init__(message)


class InvalidTagName(Exception):
    """Raised when a tag name is empty after normalization."""

    def __init__(self, message: str = "Tag name cannot be empty"):
        super().__init__(message)


class InvalidTagColor(Exception):
    """Raised when a tag color is not a #RRGGBB hex value."""

    def __init__(self, message: str = "Invalid color format. Use #RRGGBB"):
        super().__init__(message)


class TranscriptionTargetNotFound(Exception):
    """Raised when transcription target video does not exist."""

    def __init__(self, video_id: int):
        self.video_id = video_id
        super().__init__(f"Video {video_id} not found")


class TranscriptionFailed(Exception):
    """Raised when transcription processing fails for a video."""

    def __init__(self, video_id: int, reason: str):
        self.video_id = video_id
        self.reason = reason
        super().__init__(f"Transcription failed for video {video_id}: {reason}")
