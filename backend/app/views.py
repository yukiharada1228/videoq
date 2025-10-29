import mimetypes
import os

from app.models import VideoGroup, VideoGroupMember
from django.conf import settings
from django.http import Http404, HttpResponse
from rest_framework.authentication import BaseAuthentication
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

# CookieJWTAuthenticationは app.authentication からインポート
from app.authentication import CookieJWTAuthentication


class ShareTokenAuthentication(BaseAuthentication):
    """
    共有トークンによる認証クラス

    クエリパラメータ 'share_token' から共有グループの検証を行う
    """

    def authenticate(self, request: Request):
        share_token = request.query_params.get("share_token")
        if not share_token:
            return None

        # 共有トークンが有効かチェック
        group = VideoGroup.objects.filter(share_token=share_token).first()
        if not group:
            return None

        # 匿名ユーザーとして扱う（特別なマーカー）
        return (None, {"share_token": share_token, "group": group})


class IsAuthenticatedOrSharedAccess(BasePermission):
    """
    JWT認証済みユーザー、または有効な共有トークンを持つユーザーを許可
    """

    def has_permission(self, request, view):
        # JWT認証済み
        if request.user and request.user.is_authenticated:
            return True

        # 共有トークン認証済み
        if hasattr(request, "auth") and isinstance(request.auth, dict):
            if "share_token" in request.auth:
                return True

        return False


class ProtectedMediaView(APIView):
    """
    JWT認証または共有トークンで保護されたメディアファイルを配信するビュー

    認証方法:
    1. Authorization ヘッダー (Bearer <token>) - ログインユーザー用
    2. HttpOnly Cookie (access_token) - ログインユーザーの動画ストリーミング用
    3. クエリパラメータ (share_token) - 共有グループの動画アクセス用
    """

    authentication_classes = [CookieJWTAuthentication, ShareTokenAuthentication]
    permission_classes = [IsAuthenticatedOrSharedAccess]

    def get(self, request: Request, path: str):
        """
        認証されたユーザーにメディアファイルを配信

        Args:
            request: HTTPリクエスト
            path: メディアファイルのパス

        Returns:
            X-Accel-Redirect を使用したレスポンス

        Raises:
            Http404: ファイルが存在しない場合
        """
        # ファイルの存在確認
        file_path = os.path.join(settings.MEDIA_ROOT, path)
        if not os.path.exists(file_path):
            raise Http404()

        # pathから動画ファイルを特定
        # path例: videos/1/video_xxxxx.mp4
        from app.models import Video
        video = Video.objects.filter(file=path).first()

        if not video:
            raise Http404()

        # 共有トークンによるアクセスの場合、動画が共有グループに属しているか確認
        if hasattr(request, "auth") and isinstance(request.auth, dict):
            if "share_token" in request.auth:
                group = request.auth.get("group")

                # この動画が共有グループに含まれているかチェック
                is_in_group = VideoGroupMember.objects.filter(
                    group=group,
                    video=video
                ).exists()

                if not is_in_group:
                    raise Http404()
        else:
            # JWT認証ユーザーの場合、動画がそのユーザーの所有物であることを確認
            if request.user and request.user.is_authenticated:
                if video.user != request.user:
                    raise Http404()
            else:
                # 認証されていない場合はアクセス不可
                raise Http404()

        # X-Accel-Redirect を使用して nginx にファイル配信を委譲
        response = HttpResponse()
        content_type, _ = mimetypes.guess_type(file_path)
        if content_type:
            response["Content-Type"] = content_type
        response["X-Accel-Redirect"] = f"/protected_media/{path}"

        return response