"""Application-level exceptions for the chat use-case context."""


class LLMConfigurationError(Exception):
    """Raised when the LLM cannot be configured (missing/invalid API key, unknown provider)."""


class LLMProviderError(Exception):
    """Raised when the LLM provider returns an error during generation."""


class ChatNotFoundError(Exception):
    """Raised when a chat log is not found."""


class InvalidFeedbackError(Exception):
    """Raised when the requested feedback value is invalid."""


class FeedbackPermissionDenied(Exception):
    """Raised when the caller cannot update feedback on the target chat log."""
