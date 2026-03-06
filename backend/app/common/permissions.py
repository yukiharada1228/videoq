"""Common permissions and authentication helper module"""

from rest_framework.authentication import BaseAuthentication
from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from app.dependencies.auth import (
    get_authorize_api_key_use_case,
    get_resolve_share_token_use_case,
)
from app.domain.auth.scopes import SCOPE_READ, SCOPE_WRITE


class ShareTokenAuthentication(BaseAuthentication):
    """Simple authentication using share token"""

    resolve_share_token_use_case_factory = staticmethod(get_resolve_share_token_use_case)

    def __init__(self, resolve_share_token_use_case_factory=None):
        if resolve_share_token_use_case_factory is not None:
            self.resolve_share_token_use_case_factory = resolve_share_token_use_case_factory

    def authenticate(self, request: Request):
        share_token = request.query_params.get("share_token")
        if not share_token:
            return None

        resolved = self.resolve_share_token_use_case_factory().execute(share_token)
        if resolved is None:
            return None

        return (None, {"share_token": resolved.share_token, "group_id": resolved.group_id})


class IsAuthenticatedOrSharedAccess(BasePermission):
    """Common permission that allows JWT authentication or share token"""

    def has_permission(self, request, view):
        if request.user and request.user.is_authenticated:
            return True

        if hasattr(request, "auth") and isinstance(request.auth, dict):
            if "share_token" in request.auth:
                return True

        return False


class ApiKeyScopePermission(BasePermission):
    """Authorize requests authenticated by API key using use-case policy."""

    message = "This API key does not have permission for this action."
    authorize_api_key_use_case_factory = staticmethod(get_authorize_api_key_use_case)

    def __init__(self, authorize_api_key_use_case_factory=None):
        if authorize_api_key_use_case_factory is not None:
            self.authorize_api_key_use_case_factory = authorize_api_key_use_case_factory

    def has_permission(self, request, view):
        auth = getattr(request, "auth", None)
        if not (
            isinstance(auth, dict)
            and "api_key_id" in auth
            and "access_level" in auth
        ):
            return True

        required_scope = self._get_required_scope(request, view)
        if not required_scope:
            return True

        use_case = self.authorize_api_key_use_case_factory()
        return use_case.execute(
            access_level=auth["access_level"],
            required_scope=required_scope,
        )

    def _get_required_scope(self, request, view) -> str:
        scopes_by_method = getattr(view, "required_scopes", None)
        if isinstance(scopes_by_method, dict):
            scoped = scopes_by_method.get(request.method)
            if scoped:
                return scoped

        explicit_scope = getattr(view, "required_scope", None)
        if explicit_scope:
            return explicit_scope

        if request.method in {"GET", "HEAD", "OPTIONS"}:
            return SCOPE_READ
        return SCOPE_WRITE
