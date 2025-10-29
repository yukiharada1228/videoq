import mimetypes
import os

from django.conf import settings
from django.http import Http404, HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken


class CookieJWTAuthentication(JWTAuthentication):
    """
    Cookie または Authorization ヘッダーから JWT トークンを取得する認証クラス

    優先順位:
    1. Authorization ヘッダー (API リクエスト用)
    2. HttpOnly Cookie (動画ストリーミング用)
    """

    def authenticate(self, request: Request):
        # まず Authorization ヘッダーから認証を試みる
        header_auth = super().authenticate(request)
        if header_auth is not None:
            return header_auth

        # Cookie から access_token を取得
        raw_token = request.COOKIES.get("access_token")
        if raw_token is None:
            return None

        try:
            validated_token = self.get_validated_token(raw_token)
            return self.get_user(validated_token), validated_token
        except InvalidToken:
            return None


class ProtectedMediaView(APIView):
    """
    JWT認証で保護されたメディアファイルを配信するビュー

    認証方法:
    1. Authorization ヘッダー (Bearer <token>) - API リクエスト用
    2. HttpOnly Cookie (access_token) - 動画ストリーミング用
    """

    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsAuthenticated]

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

        # X-Accel-Redirect を使用して nginx にファイル配信を委譲
        response = HttpResponse()
        content_type, _ = mimetypes.guess_type(file_path)
        if content_type:
            response["Content-Type"] = content_type
        response["X-Accel-Redirect"] = f"/protected_media/{path}"

        return response