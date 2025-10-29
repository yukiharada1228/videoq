import mimetypes
import os

from django.conf import settings
from django.http import Http404, HttpResponse
from rest_framework_simplejwt.authentication import JWTAuthentication


def protected_media(request, path):
    share_token = request.GET.get("share_token")
    token_param = request.GET.get("token")
    
    # JWT認証をチェック（Authorizationヘッダーまたはtokenクエリパラメータ）
    jwt_auth = JWTAuthentication()
    user_authenticated = False
    
    # Authorizationヘッダーから認証を試行
    try:
        user, token = jwt_auth.authenticate(request)
        user_authenticated = user is not None
    except:
        pass
    
    # tokenクエリパラメータから認証を試行
    if not user_authenticated and token_param:
        from rest_framework_simplejwt.tokens import AccessToken
        try:
            access_token = AccessToken(token_param)
            user = access_token.payload.get('user_id')
            if user:
                from django.contrib.auth import get_user_model
                User = get_user_model()
                user_obj = User.objects.get(id=user)
                user_authenticated = True
        except:
            pass

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
        from django.http import HttpResponse

        response = HttpResponse("Authentication required. Please provide a valid JWT token or share_token.", status=401)
        return response

    file_path = os.path.join(settings.MEDIA_ROOT, path)
    if not os.path.exists(file_path):
        raise Http404()
    response = HttpResponse()
    content_type, _ = mimetypes.guess_type(file_path)
    if content_type:
        response["Content-Type"] = content_type
    response["X-Accel-Redirect"] = f"/protected_media/{path}"
    return response
