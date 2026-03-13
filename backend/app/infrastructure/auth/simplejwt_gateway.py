"""
SimpleJWT implementation of the TokenGateway port.
All JWT token creation and validation logic is isolated here.
"""

from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework_simplejwt.exceptions import InvalidToken as JWTInvalidToken
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
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
            serializer = TokenRefreshSerializer(data={"refresh": refresh_token})
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
            return TokenPairDto(
                access=str(data["access"]),
                refresh=str(data.get("refresh") or refresh_token),
            )
        except (JWTInvalidToken, DRFValidationError, TokenError, ValueError) as exc:
            raise TokenInvalidError("Invalid or expired refresh token.") from exc
