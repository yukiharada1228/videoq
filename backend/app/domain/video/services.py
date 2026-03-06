"""
Domain services for the video domain.
Pure business logic with no external dependencies.
"""

import secrets


class ShareLinkService:
    """Domain service for managing video group share links."""

    @staticmethod
    def generate_token() -> str:
        """Generate a cryptographically secure URL-safe share token."""
        return secrets.token_urlsafe(32)
