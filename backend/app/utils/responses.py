"""共通のレスポンスヘルパー"""

from rest_framework import status
from rest_framework.response import Response


def create_error_response(
    message: str, status_code: int = status.HTTP_400_BAD_REQUEST
) -> Response:
    """エラーレスポンスを作成する共通ヘルパー"""
    return Response({"error": message}, status=status_code)


def create_success_response(
    data: dict = None, message: str = None, status_code: int = status.HTTP_200_OK
) -> Response:
    """成功レスポンスを作成する共通ヘルパー"""
    response_data = {}
    if data:
        response_data.update(data)
    if message:
        response_data["message"] = message
    return Response(response_data, status=status_code)


def create_created_response(
    data: dict = None, message: str = "Created successfully"
) -> Response:
    """作成成功レスポンスを作成する共通ヘルパー"""
    return create_success_response(data, message, status.HTTP_201_CREATED)


def create_no_content_response() -> Response:
    """No Contentレスポンスを作成する共通ヘルパー"""
    return Response(status=status.HTTP_204_NO_CONTENT)
