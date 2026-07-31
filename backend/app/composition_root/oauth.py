"""OAuth 2.1 context DI wiring."""

from __future__ import annotations

from functools import lru_cache

from app.infrastructure.oauth.dot_client_gateway import DOTOAuthAccessTokenGateway
from app.use_cases.oauth.manage_tokens import (
    ListAuthorizedTokensUseCase,
    RevokeAuthorizedTokenUseCase,
)


@lru_cache(maxsize=1)
def _access_token_gateway() -> DOTOAuthAccessTokenGateway:
    return DOTOAuthAccessTokenGateway()


def get_list_authorized_tokens_use_case() -> ListAuthorizedTokensUseCase:
    return ListAuthorizedTokensUseCase(token_gateway=_access_token_gateway())


def get_revoke_authorized_token_use_case() -> RevokeAuthorizedTokenUseCase:
    return RevokeAuthorizedTokenUseCase(token_gateway=_access_token_gateway())
