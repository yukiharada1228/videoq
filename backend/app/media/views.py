import mimetypes

from django.contrib.auth import get_user_model
from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework.views import APIView

from app.common.authentication import APIKeyAuthentication, CookieJWTAuthentication
from app.common.permissions import (IsAuthenticatedOrSharedAccess,
                                    ShareTokenAuthentication)
from app.media.adapters import GetProtectedMediaAdapter
from app.media.services import assert_video_access, resolve_protected_media
from app.media.use_cases import GetProtectedMediaQuery, GetProtectedMediaUseCase

User = get_user_model()


def _actor_id_from_request(request):
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    return user.id


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
        share_group = request.auth.get("group") if isinstance(request.auth, dict) else None
        result = GetProtectedMediaUseCase(
            protected_media_getter=GetProtectedMediaAdapter(
                user_model=User,
                protected_media_resolver=resolve_protected_media,
                video_access_authorizer=assert_video_access,
            ),
        ).execute(
            GetProtectedMediaQuery(
                path=path,
                actor_id=_actor_id_from_request(request),
                share_group=share_group,
            )
        )

        response = HttpResponse()
        content_type, _ = mimetypes.guess_type(result.file_path)
        if content_type:
            response["Content-Type"] = content_type
        response["X-Accel-Redirect"] = f"/api/protected_media/{path}"

        return response
