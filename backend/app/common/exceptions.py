"""Custom exception handler for unified error responses"""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


class ErrorCode:
    """Error code constants for machine-readable error identification"""

    VALIDATION_ERROR = "VALIDATION_ERROR"
    AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    NOT_FOUND = "NOT_FOUND"
    LIMIT_EXCEEDED = "LIMIT_EXCEEDED"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR"


def custom_exception_handler(exc, context):
    """
    Custom exception handler that returns unified error format.

    Response format:
    {
        "error": {
            "code": "ERROR_CODE",
            "message": "Human readable message",
            "fields": {"fieldname": ["Error 1", "Error 2"]}  # optional
        }
    }
    """
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

    return Response({"error": error_data}, status=response.status_code)


def _get_error_code(status_code: int, exc) -> str:
    """Determine error code based on status code and exception type"""
    if status_code == status.HTTP_400_BAD_REQUEST:
        return ErrorCode.VALIDATION_ERROR
    elif status_code == status.HTTP_401_UNAUTHORIZED:
        return ErrorCode.AUTHENTICATION_FAILED
    elif status_code == status.HTTP_403_FORBIDDEN:
        return ErrorCode.PERMISSION_DENIED
    elif status_code == status.HTTP_404_NOT_FOUND:
        return ErrorCode.NOT_FOUND
    elif status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        return ErrorCode.LIMIT_EXCEEDED
    elif status_code >= 500:
        return ErrorCode.INTERNAL_ERROR
    return ErrorCode.VALIDATION_ERROR


def _get_error_message(exc, response) -> str:
    """Extract human-readable message from exception"""
    # Handle DRF validation errors
    if hasattr(exc, "detail"):
        detail = exc.detail

        # Handle string detail
        if isinstance(detail, str):
            return detail

        # Handle dict with 'detail' key
        if isinstance(detail, dict):
            if "detail" in detail:
                return str(detail["detail"])

            # Handle non_field_errors
            if "non_field_errors" in detail:
                errors = detail["non_field_errors"]
                if isinstance(errors, list) and errors:
                    return str(errors[0])

            # Get first field error as message
            for key, value in detail.items():
                if isinstance(value, list) and value:
                    return str(value[0])
                elif isinstance(value, str):
                    return value

        # Handle list of errors
        if isinstance(detail, list) and detail:
            first_error = detail[0]
            if isinstance(first_error, str):
                return first_error
            return str(first_error)

    # Fallback to status text
    return (
        response.status_text
        if hasattr(response, "status_text")
        else "An error occurred"
    )


def _get_field_errors(exc) -> dict | None:
    """Extract field-specific errors from validation exception"""
    if not hasattr(exc, "detail"):
        return None

    detail = exc.detail

    if not isinstance(detail, dict):
        return None

    fields = {}
    for key, value in detail.items():
        # Skip non-field errors and detail key
        if key in ("non_field_errors", "detail"):
            continue

        if isinstance(value, list):
            fields[key] = [str(e) for e in value]
        elif isinstance(value, str):
            fields[key] = [value]

    return fields if fields else None
