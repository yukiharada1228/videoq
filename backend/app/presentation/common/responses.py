"""Presentation-layer response helpers."""

from typing import Any

from rest_framework import status
from rest_framework.response import Response

INTERNAL_ERROR_MESSAGE = "An internal server error occurred."


def create_error_response(
    message: str,
    status_code: int = status.HTTP_400_BAD_REQUEST,
    code: str = "VALIDATION_ERROR",
    fields: dict | None = None,
    params: dict | None = None,
) -> Response:
    """Generate unified error response."""
    if status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
        message = INTERNAL_ERROR_MESSAGE
        if code == "VALIDATION_ERROR":
            code = "INTERNAL_ERROR"

    error_data: dict[str, Any] = {
        "code": code,
        "message": message,
    }

    if fields is not None:
        error_data["fields"] = fields

    if params is not None:
        error_data["params"] = params

    return Response({"error": error_data}, status=status_code)


def create_success_response(
    data: dict | None = None,
    message: str | None = None,
    status_code: int = status.HTTP_200_OK,
) -> Response:
    """Generate success response."""

    response_data: dict = {}
    if data:
        response_data.update(data)
    if message:
        response_data["message"] = message
    return Response(response_data, status=status_code)


def create_created_response(
    data: dict | None = None,
    message: str = "Created successfully",
) -> Response:
    """Generate created success response."""

    return create_success_response(data, message, status.HTTP_201_CREATED)


def create_no_content_response() -> Response:
    """No Content response."""

    return Response(status=status.HTTP_204_NO_CONTENT)
