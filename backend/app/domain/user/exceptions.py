"""Domain exceptions for user context."""


class UserVideoLimitExceeded(Exception):
    """Raised when user has reached allowed video uploads."""

    def __init__(self, limit: int):
        self.limit = limit
        super().__init__(f"Video upload limit reached: {limit}")
