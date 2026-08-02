"""Domain exceptions for chat policies."""


class InvalidFeedbackValue(Exception):
    """Raised when feedback is not one of the allowed values."""


class FeedbackAccessDenied(Exception):
    """Raised when a caller is not allowed to access the chat feedback target."""
