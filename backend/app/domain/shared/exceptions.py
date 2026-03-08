"""Neutral domain exceptions shared across infrastructure and use cases."""


class LLMConfigError(Exception):
    """Raised when LLM configuration is invalid or missing."""


class TokenInvalidError(Exception):
    """Raised when token verification fails."""
