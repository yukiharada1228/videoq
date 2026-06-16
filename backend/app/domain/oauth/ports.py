"""Ports for the OAuth 2.1 authorization server context."""

from __future__ import annotations

from abc import ABC, abstractmethod

from .dto import (
    AuthorizedTokenSummary,
    ClientRegistrationRequest,
    ClientRegistrationResponse,
)


class OAuthClientGateway(ABC):
    """Persist OAuth clients registered via RFC 7591 Dynamic Client Registration."""

    @abstractmethod
    def register(
        self, request: ClientRegistrationRequest
    ) -> ClientRegistrationResponse:
        """Create an OAuth public/confidential client."""


class OAuthAccessTokenGateway(ABC):
    """Inspect and revoke access tokens issued to a user."""

    @abstractmethod
    def list_for_user(self, user_id: int) -> list[AuthorizedTokenSummary]:
        """Return tokens that have not yet expired or been revoked."""

    @abstractmethod
    def revoke_for_user(self, user_id: int, token_id: int) -> bool:
        """Revoke ``token_id`` if it belongs to ``user_id``. Returns success."""
