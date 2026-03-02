import mimetypes

from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.views import APIView

from app.common.authentication import APIKeyAuthentication, CookieJWTAuthentication
from app.common.permissions import (IsAuthenticatedOrSharedAccess,
                                    ShareTokenAuthentication)
from app.media.services import assert_video_access, resolve_protected_media


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
        file_path, video = resolve_protected_media(path)
        share_group = request.auth.get("group") if isinstance(request.auth, dict) else None
        assert_video_access(
            video=video,
            request_user=request.user,
            share_group=share_group,
        )

        response = HttpResponse()
        content_type, _ = mimetypes.guess_type(file_path)
        if content_type:
            response["Content-Type"] = content_type
        response["X-Accel-Redirect"] = f"/api/protected_media/{path}"

        return response
