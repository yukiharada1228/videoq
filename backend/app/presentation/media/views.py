from django.http import Http404, HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.views import APIView

from app.common.authentication import APIKeyAuthentication, CookieJWTAuthentication
from app.common.permissions import (
    ApiKeyScopePermission,
    IsAuthenticatedOrSharedAccess,
    ShareTokenAuthentication,
)
from app.container import get_container
from app.use_cases.media.resolve_protected_media import ResolveProtectedMediaInput
from app.use_cases.shared.exceptions import ResourceNotFound


class ProtectedMediaView(APIView):
    """View to serve media files protected by JWT authentication or share token"""

    authentication_classes = [
        APIKeyAuthentication,
        CookieJWTAuthentication,
        ShareTokenAuthentication,
    ]
    permission_classes = [IsAuthenticatedOrSharedAccess, ApiKeyScopePermission]

    @extend_schema(
        responses={
            200: OpenApiResponse(
                response=OpenApiTypes.BINARY,
                description="Protected media file response.",
            )
        },
        summary="Get protected media",
        description="Stream a protected media file when the requester has access.",
    )
    def get(self, request, path: str):
        user_id = None
        group_id = None
        if (
            hasattr(request, "auth")
            and isinstance(request.auth, dict)
            and "share_token" in request.auth
        ):
            group_id = request.auth.get("group_id")
        elif request.user and request.user.is_authenticated:
            user_id = request.user.id

        try:
            resolved = get_container().get_resolve_protected_media_use_case().execute(
                ResolveProtectedMediaInput(path=path, user_id=user_id, group_id=group_id)
            )
        except ResourceNotFound:
            raise Http404()

        response = HttpResponse()
        if resolved.content_type:
            response["Content-Type"] = resolved.content_type
        response["X-Accel-Redirect"] = resolved.redirect_path

        return response
