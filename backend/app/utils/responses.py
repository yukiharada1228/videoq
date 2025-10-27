"""共通のレスポンスヘルパー（DRY原則）"""

from rest_framework import status
from rest_framework.response import Response


def create_error_response(
    message: str, status_code: int = status.HTTP_400_BAD_REQUEST
) -> Response:
    """エラーレスポンスを作成する共通ヘルパー（DRY原則）"""
    return Response({"error": message}, status=status_code)
