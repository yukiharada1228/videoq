"""
Lambda Web Adapter 用ヘルスチェックエンドポイント。

AWS_LWA_READINESS_CHECK_PATH=/api/health/ として設定することで、
LWA は Gunicorn の起動完了を確認してからリクエストの転送を開始する。

認証不要・DB アクセスなし。WSGI アプリが応答できるかのみ確認。
"""
from django.http import JsonResponse
from django.views import View


class HealthCheckView(View):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return JsonResponse({"status": "ok"}, status=200)
