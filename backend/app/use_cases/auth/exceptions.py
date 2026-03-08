"""
Use case exceptions for the auth context.
"""


class AuthenticationFailed(Exception):
    """Raised when user credentials are invalid."""


class InvalidToken(Exception):
    """Raised when a JWT token is invalid or expired."""
