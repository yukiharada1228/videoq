"""Presentation-layer authentication utilities."""

from dataclasses import dataclass

from django.utils.translation import gettext_lazy as _
from rest_framework.authentication import BaseAuthentication, CSRFCheck
from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework.permissions import SAFE_METHODS
from rest_framework.request import Request

from app.dependencies.common import get_cookie_jwt_validator, get_resolve_api_key_use_case


@dataclass(frozen=True)
class APIKeyPrincipal:
    """Minimal authenticated principal for API key requests."""

    id: int

    @property
    def pk(self) -> int:
        return self.id

    @property
    def is_authenticated(self) -> bool:
        return True


class APIKeyAuthentication(BaseAuthentication):
    """Authenticate requests using an API key header."""

    keyword = "ApiKey"
    header_name = "HTTP_X_API_KEY"
    resolve_api_key_use_case_factory = staticmethod(get_resolve_api_key_use_case)

    def __init__(self, resolve_api_key_use_case_factory=None):
        if resolve_api_key_use_case_factory is not None:
            self.resolve_api_key_use_case_factory = resolve_api_key_use_case_factory

    def authenticate(self, request: Request):
        raw_key = self.get_raw_key(request)
        if raw_key is None:
            return None

        if not raw_key.startswith("vq_") or len(raw_key) < 12:
            return None

        resolved = self.resolve_api_key_use_case_factory().execute(raw_key)
        if resolved is None:
            raise AuthenticationFailed(_("Invalid API key"))

        principal = APIKeyPrincipal(id=resolved.user_id)
        return principal, {
            "api_key_id": resolved.api_key_id,
            "user_id": resolved.user_id,
            "access_level": resolved.access_level,
        }

    def authenticate_header(self, request: Request) -> str:
        return f'{self.keyword} realm="api"'

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


class BearerAPIKeyAuthentication(APIKeyAuthentication):
    """APIKeyAuthentication that also accepts the standard Bearer scheme.

    Used for OpenAI-compatible endpoints where the OpenAI SDK sends
    ``Authorization: Bearer <key>`` instead of ``Authorization: ApiKey <key>``.
    """

    keyword = "Bearer"


class CookieJWTAuthentication(BaseAuthentication):
    """Authentication class that retrieves JWT token from cookie or authorization header.

    JWT validation is delegated to CookieJWTValidator (infrastructure/auth) via DI,
    keeping simplejwt details out of the presentation layer.
    """

    cookie_jwt_validator_factory = staticmethod(get_cookie_jwt_validator)

    def __init__(self, cookie_jwt_validator_factory=None):
        if cookie_jwt_validator_factory is not None:
            self.cookie_jwt_validator_factory = cookie_jwt_validator_factory

    def enforce_csrf(self, request: Request) -> None:
        """Apply Django's CSRF check to unsafe cookie-authenticated requests."""
        if request.method in SAFE_METHODS:
            return

        check = CSRFCheck(lambda _request: None)
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise PermissionDenied(f"CSRF Failed: {reason}")

    def authenticate(self, request: Request):
        validator = self.cookie_jwt_validator_factory()

        # Try Bearer header first
        result = validator.authenticate_from_request(request)
        if result is not None:
            return result

        # Fall back to cookie
        raw_token = request.COOKIES.get("access_token")
        if raw_token is None:
            return None

        validated = validator.validate_raw_token(raw_token)
        if validated is None:
            return None

        self.enforce_csrf(request)
        return validated

    def authenticate_header(self, request: Request) -> str:
        return 'Bearer realm="api"'
