"""共通の権限・認証補助モジュール"""

from app.models import VideoGroup
from rest_framework.authentication import BaseAuthentication
from rest_framework.permissions import BasePermission
from rest_framework.request import Request


class ShareTokenAuthentication(BaseAuthentication):
    """共有トークンを用いた簡易認証"""

    def authenticate(self, request: Request):
        share_token = request.query_params.get("share_token")
        if not share_token:
            return None

        group = VideoGroup.objects.filter(share_token=share_token).first()
        if not group:
            return None

        return (None, {"share_token": share_token, "group": group})


class IsAuthenticatedOrSharedAccess(BasePermission):
    """JWT認証または共有トークンを許可する共通パーミッション"""

    def has_permission(self, request, view):
        if request.user and request.user.is_authenticated:
            return True

        if hasattr(request, "auth") and isinstance(request.auth, dict):
            if "share_token" in request.auth:
                return True

        return False
