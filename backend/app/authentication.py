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
        print(f"🍪 CookieJWTAuthentication: Received cookies: {request.COOKIES}")
        
        # まず Authorization ヘッダーから認証を試みる
        header_auth = super().authenticate(request)
        if header_auth is not None:
            print("🍪 CookieJWTAuthentication: Header auth successful")
            return header_auth

        # Cookie から access_token を取得
        raw_token = request.COOKIES.get("access_token")
        print(f"🍪 CookieJWTAuthentication: Raw token from cookie: {raw_token[:20] if raw_token else None}...")
        
        if raw_token is None:
            print("🍪 CookieJWTAuthentication: No access_token cookie found")
            return None

        try:
            validated_token = self.get_validated_token(raw_token)
            user = self.get_user(validated_token)
            print(f"🍪 CookieJWTAuthentication: Cookie auth successful for user: {user.username}")
            return user, validated_token
        except InvalidToken as e:
            print(f"🍪 CookieJWTAuthentication: Invalid token error: {e}")
            return None

