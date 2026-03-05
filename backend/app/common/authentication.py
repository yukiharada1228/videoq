"""Common authentication utilities"""

from django.utils.translation import gettext_lazy as _
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.request import Request
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken

from app.models import UserApiKey


class APIKeyAuthentication(BaseAuthentication):
    """Authenticate requests using an API key header."""

    keyword = "ApiKey"
    header_name = "HTTP_X_API_KEY"
    read_only_allowed_methods = {"GET", "HEAD", "OPTIONS"}
    read_only_allowed_post_paths = {"/api/chat", "/chat"}

    def authenticate(self, request: Request):
        raw_key = self.get_raw_key(request)
        if raw_key is None:
            return None

        hashed_key = UserApiKey.hash_key(raw_key)
        api_key = (
            UserApiKey.objects.select_related("user")
            .filter(
                hashed_key=hashed_key,
                revoked_at__isnull=True,
                user__is_active=True,
            )
            .first()
        )
        if api_key is None:
            raise AuthenticationFailed(_("Invalid API key"))

        if (
            api_key.access_level == UserApiKey.AccessLevel.READ_ONLY
            and not self.is_read_only_request_allowed(request)
        ):
            raise AuthenticationFailed(_("This API key is read-only"))

        api_key.mark_used()
        return api_key.user, api_key

    def is_read_only_request_allowed(self, request: Request) -> bool:
        if request.method in self.read_only_allowed_methods:
            return True

        if request.method != "POST":
            return False

        normalized_path = request.path_info.rstrip("/")
        return normalized_path in self.read_only_allowed_post_paths

    def authenticate_header(self, request: Request) -> str:
        return f"{self.keyword} realm=\"api\""

    def get_raw_key(self, request: Request) -> str | None:
        header_key = request.META.get(self.header_name)
        if header_key:
            return header_key.strip() or None

        auth_header = request.headers.get("Authorization", "")
        if not auth_header:
            return None

        try:
            keyword, value = auth_header.split(" ", 1)
        except ValueError:
            return None

        if keyword != self.keyword:
            return None

        return value.strip() or None


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
