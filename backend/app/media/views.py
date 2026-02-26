import mimetypes
import os

from django.conf import settings
from django.http import Http404, HttpResponse
from rest_framework.views import APIView

from app.common.authentication import CookieJWTAuthentication
from app.common.permissions import (IsAuthenticatedOrSharedAccess,
                                    ShareTokenAuthentication)
from app.models import Video, VideoGroupMember


def _check_video_access(request, video) -> bool:
    """Check whether the request has access to the given video.

    Returns True if access is granted, raises Http404 otherwise.
    """
    if (
        hasattr(request, "auth")
        and isinstance(request.auth, dict)
        and "share_token" in request.auth
    ):
        group = request.auth.get("group")
        if not VideoGroupMember.objects.filter(group=group, video=video).exists():
            raise Http404()
        return True

    if request.user and request.user.is_authenticated:
        if video.user != request.user:
            raise Http404()
        return True

    raise Http404()


class ProtectedMediaView(APIView):
    """View to serve media files protected by JWT authentication or share token"""

    authentication_classes = [CookieJWTAuthentication, ShareTokenAuthentication]
    permission_classes = [IsAuthenticatedOrSharedAccess]

    def get(self, request, path: str):
        file_path = os.path.join(settings.MEDIA_ROOT, path)
        if not os.path.exists(file_path):
            raise Http404()

        video = Video.objects.filter(file=path).first()
        if not video:
            raise Http404()

        _check_video_access(request, video)

        response = HttpResponse()
        content_type, _ = mimetypes.guess_type(file_path)
        if content_type:
            response["Content-Type"] = content_type
        response["X-Accel-Redirect"] = f"/api/protected_media/{path}"

        return response
