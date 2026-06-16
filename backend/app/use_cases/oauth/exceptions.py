"""Exceptions for the OAuth 2.1 use cases."""


class InvalidClientMetadata(ValueError):
    """Raised when RFC 7591 client metadata fails validation."""

    def __init__(
        self, error: str = "invalid_client_metadata", description: str | None = None
    ) -> None:
        super().__init__(description or error)
        self.error = error
        self.description = description
