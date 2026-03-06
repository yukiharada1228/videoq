"""Common response processing utilities."""

from typing import Any, Dict, List, Optional

from rest_framework import status
from rest_framework.response import Response


class ResponseBuilder:
    """Common response building class."""

    @staticmethod
    def success(
        data: Any = None,
        message: str = "Operation completed successfully",
        status_code: int = status.HTTP_200_OK,
        meta: Optional[Dict[str, Any]] = None,
    ) -> Response:
        """Build success response."""
        response_data = {
            "success": True,
            "message": message,
            "data": data,
        }

        if meta:
            response_data["meta"] = meta

        return Response(response_data, status=status_code)

    @staticmethod
    def error(
        message: str = "An error occurred",
        status_code: int = status.HTTP_400_BAD_REQUEST,
        errors: Optional[Dict[str, List[str]]] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> Response:
        """Build error response."""
        response_data = {
            "success": False,
            "message": message,
        }

        if errors:
            response_data["errors"] = errors

        if details:
            response_data["details"] = details

        return Response(response_data, status=status_code)

    @staticmethod
    def paginated(
        data: List[Any],
        page: int,
        page_size: int,
        total_count: int,
        message: str = "Data retrieved successfully",
    ) -> Response:
        """Build paginated response."""
        total_pages = (total_count + page_size - 1) // page_size

        meta = {
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_count": total_count,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_previous": page > 1,
            }
        }

        return ResponseBuilder.success(data=data, message=message, meta=meta)


class ValidationHelper:
    """Common validation helper."""

    @staticmethod
    def validate_required_fields(
        data: Dict[str, Any], required_fields: List[str]
    ) -> tuple[bool, Optional[Dict[str, List[str]]]]:
        """Validate required fields."""
        errors = {}

        for field in required_fields:
            if field not in data or not data[field]:
                errors[field] = [f"{field} is required"]

        return len(errors) == 0, errors if errors else None

    @staticmethod
    def validate_field_length(
        data: Dict[str, Any],
        field: str,
        min_length: Optional[int] = None,
        max_length: Optional[int] = None,
    ) -> Optional[str]:
        """Validate field length."""
        if field not in data:
            return None

        value = str(data[field])

        if min_length is not None and len(value) < min_length:
            return f"{field} must be at least {min_length} characters"

        if max_length is not None and len(value) > max_length:
            return f"{field} must be at most {max_length} characters"

        return None

    @staticmethod
    def validate_email_format(email: str) -> bool:
        """Validate email format."""
        import re

        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        return re.match(pattern, email) is not None


class CacheHelper:
    """Common cache helper."""

    @staticmethod
    def get_cache_key(prefix: str, *args: Any) -> str:
        """Generate cache key."""
        key_parts = [prefix] + [str(arg) for arg in args]
        return ":".join(key_parts)

    @staticmethod
    def get_user_cache_key(user_id: int, resource: str) -> str:
        """Generate user-specific cache key."""
        return CacheHelper.get_cache_key("user", user_id, resource)

    @staticmethod
    def get_resource_cache_key(resource: str, resource_id: int) -> str:
        """Generate resource-specific cache key."""
        return CacheHelper.get_cache_key("resource", resource, resource_id)
