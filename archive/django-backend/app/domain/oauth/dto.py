"""DTOs for the OAuth 2.1 authorization server."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AuthorizedTokenSummary:
    """A token a user has granted to a connected OAuth client."""

    token_id: int
    client_id: str
    client_name: str
    scope: str
    issued_at_iso: str
    expires_at_iso: str | None
