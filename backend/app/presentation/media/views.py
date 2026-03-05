import mimetypes
import os

from django.conf import settings
from django.http import Http404, HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.views import APIView

from app.common.authentication import APIKeyAuthentication, CookieJWTAuthentication
from app.common.permissions import IsAuthenticatedOrSharedAccess, ShareTokenAuthentication
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
    permission_classes = [IsAuthenticatedOrSharedAccess]

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
        file_path = os.path.join(settings.MEDIA_ROOT, path)
        if not os.path.exists(file_path):
            raise Http404()

        user_id = None
        group_id = None
        if (
            hasattr(request, "auth")
            and isinstance(request.auth, dict)
            and "share_token" in request.auth
        ):
            group = request.auth.get("group")
            group_id = group.id if group else None
        elif request.user and request.user.is_authenticated:
            user_id = request.user.id

        try:
            get_container().get_resolve_protected_media_use_case().execute(
                ResolveProtectedMediaInput(path=path, user_id=user_id, group_id=group_id)
            )
        except ResourceNotFound:
            raise Http404()

        response = HttpResponse()
        content_type, _ = mimetypes.guess_type(file_path)
        if content_type:
            response["Content-Type"] = content_type
        response["X-Accel-Redirect"] = f"/api/protected_media/{path}"

        return response
