import mimetypes
import os

from django.conf import settings
from django.http import Http404, HttpResponse
from rest_framework_simplejwt.authentication import JWTAuthentication


def protected_media(request, path):
    share_token = request.GET.get("share_token")
    
    # JWT認証をチェック
    jwt_auth = JWTAuthentication()
    try:
        user, token = jwt_auth.authenticate(request)
        user_authenticated = user is not None
    except:
        user_authenticated = False

    # 1. Allow logged-in users (JWT認証)
    if user_authenticated:
        pass
    # 2. Allow if share_token is valid
    elif share_token:
        from app.models import Video, VideoGroup

        try:
            filename = os.path.basename(path)
            video = Video.objects.get(file__endswith=filename)
            if VideoGroup.objects.filter(
                share_token=share_token, videos=video
            ).exists():
                pass  # Allow
            else:
                from django.http import HttpResponseForbidden

                return HttpResponseForbidden("Invalid share token for this video.")
        except Exception as e:
            from django.http import HttpResponseForbidden

            return HttpResponseForbidden("Invalid share token or video.")
    else:
        from django.http import HttpResponseUnauthorized

        return HttpResponseUnauthorized("Authentication required. Please provide a valid JWT token or share_token.")

    file_path = os.path.join(settings.MEDIA_ROOT, path)
    if not os.path.exists(file_path):
        raise Http404()
    response = HttpResponse()
    content_type, _ = mimetypes.guess_type(file_path)
    if content_type:
        response["Content-Type"] = content_type
    response["X-Accel-Redirect"] = f"/protected_media/{path}"
    return response
