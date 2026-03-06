"""
Cookie/Bearer JWT token validator backed by simplejwt.
Infrastructure concern: token validation and user lookup.
All simplejwt-specific logic is isolated here.
"""

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken


class CookieJWTValidator(JWTAuthentication):
    """Validates JWT tokens (from raw string or Bearer header) and returns (user, token)."""

    def validate_raw_token(self, raw_token: str):
        """Validate a raw token string. Returns (user, validated_token) or None."""
        try:
            validated_token = self.get_validated_token(raw_token.encode("utf-8"))
            user = self.get_user(validated_token)
            return user, validated_token
        except InvalidToken:
            return None

    def authenticate_from_request(self, request):
        """Attempt Bearer-header-based JWT authentication. Returns (user, token) or None."""
        return super().authenticate(request)
