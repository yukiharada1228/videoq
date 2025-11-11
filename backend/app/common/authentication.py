"""Common authentication utilities"""

from rest_framework.request import Request
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken


class CookieJWTAuthentication(JWTAuthentication):
    """Authentication class that retrieves JWT token from Cookie or Authorization header"""

    def authenticate(self, request: Request):
        header_auth = super().authenticate(request)
        if header_auth is not None:
            return header_auth

        raw_token = request.COOKIES.get("access_token")
        if raw_token is None:
            return None

        try:
            validated_token = self.get_validated_token(raw_token)
            user = self.get_user(validated_token)
            return user, validated_token
        except InvalidToken:
            return None
