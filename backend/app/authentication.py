"""
認証関連のクラス定義
"""

from rest_framework.request import Request
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
            user = self.get_user(validated_token)
            return user, validated_token
        except InvalidToken:
            return None

