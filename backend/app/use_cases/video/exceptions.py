"""Domain exceptions for the video use cases."""


class VideoLimitExceeded(Exception):
    """Raised when a user has reached their video upload limit."""

    def __init__(self, limit: int):
        self.limit = limit
        super().__init__(
            f"Video upload limit reached. You can upload up to {limit} video(s)."
        )


class ResourceNotFound(Exception):
    """Raised when a requested resource does not exist."""

    def __init__(self, entity_name: str):
        self.entity_name = entity_name
        super().__init__(f"{entity_name} not found.")


class PermissionDenied(Exception):
    """Raised when the user lacks permission for an action."""
