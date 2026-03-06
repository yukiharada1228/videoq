"""
SimpleJWT implementation of the TokenGateway port.
All JWT token creation and validation logic is isolated here.
"""

from typing import Any, cast

from rest_framework_simplejwt.exceptions import InvalidToken as JWTInvalidToken
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken

from app.domain.auth.dtos import TokenPairDto
from app.domain.auth.ports import TokenGateway
from app.domain.shared.exceptions import TokenInvalidError


class SimpleJWTGateway(TokenGateway):
    """Concrete TokenGateway backed by SimpleJWT."""

    def issue_for_user(self, user_id: int) -> TokenPairDto:
        token = RefreshToken()
        token[api_settings.USER_ID_CLAIM] = user_id
        return TokenPairDto(access=str(token.access_token), refresh=str(token))

    def refresh(self, refresh_token: str) -> TokenPairDto:
        try:
            token = RefreshToken(cast(Any, refresh_token))
            return TokenPairDto(access=str(token.access_token), refresh=str(token))
        except (JWTInvalidToken, TokenError, ValueError) as exc:
            raise TokenInvalidError("Invalid or expired refresh token.") from exc
