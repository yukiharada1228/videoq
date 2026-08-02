"""Use cases for inspecting and revoking issued OAuth tokens."""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.oauth.dto import AuthorizedTokenSummary
from app.domain.oauth.ports import OAuthAccessTokenGateway


@dataclass(frozen=True)
class ListAuthorizedTokensUseCase:
    """Return the OAuth tokens currently authorized for ``user_id``."""

    token_gateway: OAuthAccessTokenGateway

    def execute(self, user_id: int) -> list[AuthorizedTokenSummary]:
        return self.token_gateway.list_for_user(user_id)


@dataclass(frozen=True)
class RevokeAuthorizedTokenUseCase:
    """Revoke a single OAuth token owned by ``user_id``."""

    token_gateway: OAuthAccessTokenGateway

    def execute(self, user_id: int, token_id: int) -> bool:
        return self.token_gateway.revoke_for_user(user_id, token_id)
