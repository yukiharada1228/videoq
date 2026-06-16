"""DTOs for the OAuth 2.1 authorization server."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ClientRegistrationRequest:
    """Subset of RFC 7591 client metadata that VideoQ accepts."""

    redirect_uris: list[str]
    client_name: str | None = None
    token_endpoint_auth_method: str = "none"
    grant_types: list[str] = field(default_factory=lambda: ["authorization_code"])
    response_types: list[str] = field(default_factory=lambda: ["code"])
    scope: str | None = None
    software_id: str | None = None
    software_version: str | None = None


@dataclass(frozen=True)
class ClientRegistrationResponse:
    """RFC 7591 successful registration response."""

    client_id: str
    client_secret: str | None
    redirect_uris: list[str]
    grant_types: list[str]
    response_types: list[str]
    token_endpoint_auth_method: str
    client_name: str | None
    scope: str | None
    client_id_issued_at: int


@dataclass(frozen=True)
class AuthorizedTokenSummary:
    """A token a user has granted to a connected OAuth client."""

    token_id: int
    client_id: str
    client_name: str
    scope: str
    issued_at_iso: str
    expires_at_iso: str | None
