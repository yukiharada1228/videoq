"""Common permissions and authentication helper module"""

from rest_framework.authentication import BaseAuthentication
from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from app.models import VideoGroup
from app.use_cases.auth.authorize_api_key import SCOPE_READ, SCOPE_WRITE


class ShareTokenAuthentication(BaseAuthentication):
    """Simple authentication using share token"""

    def authenticate(self, request: Request):
        share_token = request.query_params.get("share_token")
        if not share_token:
            return None

        group = VideoGroup.objects.filter(share_token=share_token).first()
        if not group:
            return None

        return (None, {"share_token": share_token, "group": group})


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

    def has_permission(self, request, view):
        api_key = getattr(request, "auth", None)
        if not (hasattr(api_key, "access_level") and hasattr(api_key, "hashed_key")):
            return True

        required_scope = self._get_required_scope(request, view)
        if not required_scope:
            return True

        from app.container import get_container

        use_case = get_container().get_authorize_api_key_use_case()
        return use_case.execute(
            access_level=api_key.access_level,
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
