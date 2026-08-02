"""
Health-check endpoint for Lambda Web Adapter.

Setting AWS_LWA_READINESS_CHECK_PATH=/api/health/ makes LWA wait for Gunicorn to
finish starting before it begins forwarding requests.

No authentication or database access is required. This endpoint only verifies
that the WSGI application can respond.
"""
from typing import Any, ClassVar

from django.http import JsonResponse
from django.views import View


class HealthCheckView(View):
    authentication_classes: ClassVar[list[Any]] = []
    permission_classes: ClassVar[list[Any]] = []

    def get(self, request):
        return JsonResponse({"status": "ok"}, status=200)
