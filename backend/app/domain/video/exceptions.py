"""Domain exceptions for the video domain."""


class VideoLimitExceeded(Exception):
    """Raised when a user has reached their video upload limit."""

    def __init__(self, limit: int):
        self.limit = limit
        super().__init__(
            f"Video upload limit reached. You can upload up to {limit} video(s)."
        )
