"""Presentation-layer exception handler for unified error responses."""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


class ErrorCode:
    VALIDATION_ERROR = "VALIDATION_ERROR"
    AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    NOT_FOUND = "NOT_FOUND"
    LIMIT_EXCEEDED = "LIMIT_EXCEEDED"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR"


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is None:
        return None

    error_code = _get_error_code(response.status_code, exc)
    message = _get_error_message(exc, response)
    fields = _get_field_errors(exc)

    error_data = {
        "code": error_code,
        "message": message,
    }

    if fields:
        error_data["fields"] = fields

    new_response = Response({"error": error_data}, status=response.status_code)

    for key, value in response.items():
        if key not in new_response:
            new_response[key] = value

    return new_response


def _extract_dict_detail(detail: dict) -> str | None:
    if "detail" in detail:
        return str(detail["detail"])

    if "non_field_errors" in detail:
        errors = detail["non_field_errors"]
        if isinstance(errors, list) and errors:
            return str(errors[0])

    for _, value in detail.items():
        if isinstance(value, list) and value:
            return str(value[0])
        if isinstance(value, str):
            return value

    return None


def _extract_list_detail(detail: list) -> str | None:
    if not detail:
        return None
    first_error = detail[0]
    return first_error if isinstance(first_error, str) else str(first_error)


def _get_error_code(status_code: int, exc) -> str:
    if status_code == status.HTTP_400_BAD_REQUEST:
        return ErrorCode.VALIDATION_ERROR
    if status_code == status.HTTP_401_UNAUTHORIZED:
        return ErrorCode.AUTHENTICATION_FAILED
    if status_code == status.HTTP_403_FORBIDDEN:
        return ErrorCode.PERMISSION_DENIED
    if status_code == status.HTTP_404_NOT_FOUND:
        return ErrorCode.NOT_FOUND
    if status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        return ErrorCode.LIMIT_EXCEEDED
    if status_code >= 500:
        return ErrorCode.INTERNAL_ERROR
    return ErrorCode.VALIDATION_ERROR


def _get_error_message(exc, response) -> str:
    if hasattr(exc, "detail"):
        detail = exc.detail

        if isinstance(detail, str):
            return detail

        if isinstance(detail, dict):
            result = _extract_dict_detail(detail)
            if result:
                return result

        if isinstance(detail, list):
            result = _extract_list_detail(detail)
            if result:
                return result

    return response.status_text if hasattr(response, "status_text") else "An error occurred"


def _get_field_errors(exc) -> dict | None:
    if not hasattr(exc, "detail"):
        return None

    detail = exc.detail

    if not isinstance(detail, dict):
        return None

    fields = {}
    for key, value in detail.items():
        if key in ("non_field_errors", "detail"):
            continue

        if isinstance(value, list):
            fields[key] = [str(e) for e in value]
        elif isinstance(value, str):
            fields[key] = [value]

    return fields if fields else None
