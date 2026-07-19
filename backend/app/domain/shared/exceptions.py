"""Neutral domain exceptions shared across infrastructure and use cases."""


class ProviderConfigError(Exception):
    """Raised when an external provider configuration is invalid or missing."""


class TokenInvalidError(Exception):
    """Raised when token verification fails."""
