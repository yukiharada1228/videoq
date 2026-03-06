"""Domain exceptions for the video domain."""


class VideoLimitExceeded(Exception):
    """Raised when a user has reached their video upload limit."""

    def __init__(self, limit: int):
        self.limit = limit
        super().__init__(
            f"Video upload limit reached. You can upload up to {limit} video(s)."
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
