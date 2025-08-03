import base64
from django.http import HttpResponse
from django.conf import settings


class BasicAuthMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        # BASIC認証の有効/無効を環境変数から取得
        self.enabled = getattr(settings, "BASIC_AUTH_ENABLED", True)
        # ユーザー名とパスワードは環境変数から取得、なければデフォルト
        self.username = getattr(settings, "BASIC_AUTH_USERNAME")
        self.password = getattr(settings, "BASIC_AUTH_PASSWORD")
        # Basic認証を除外するパスのリスト
        self.exempt_paths = [
            "/health/",  # ヘルスチェックエンドポイント
            "/share/",  # 共有URLエンドポイント
            "/media/",  # メディアファイル認証はDjangoで行う
        ]

    def __call__(self, request):
        # BASIC認証が無効な場合は認証をスキップ
        if not self.enabled:
            return self.get_response(request)

        # 除外パスかチェック
        if any(request.path.startswith(path) for path in self.exempt_paths):
            return self.get_response(request)

        auth_header = request.META.get("HTTP_AUTHORIZATION")
        if auth_header is not None and auth_header.startswith("Basic "):
            encoded_credentials = auth_header.split(" ", 1)[1].strip()
            try:
                decoded_credentials = base64.b64decode(encoded_credentials).decode(
                    "utf-8"
                )
            except Exception:
                return self.unauthorized_response()
            username, sep, password = decoded_credentials.partition(":")
            if sep and username == self.username and password == self.password:
                return self.get_response(request)
        return self.unauthorized_response()

    def unauthorized_response(self):
        response = HttpResponse("Unauthorized", status=401)
        response["WWW-Authenticate"] = 'Basic realm="Restricted"'
        return response
