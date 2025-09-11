"""
Utility functions for VideoQ application
"""

import logging
from typing import Dict, Any, Optional
from django.http import JsonResponse, HttpResponse
from django.core.exceptions import ValidationError as DjangoValidationError
from .exceptions import VideoQException

# Logger configuration
logger = logging.getLogger("app")


class ErrorResponseHandler:
    """Unified error response handling class"""

    @staticmethod
    def create_error_response(
        message: str,
        error_code: str = "GENERAL_ERROR",
        status_code: int = 500,
        details: Optional[Dict[str, Any]] = None,
        user_message: Optional[str] = None,
    ) -> JsonResponse:
        """
        Create unified error response

        Args:
            message: Internal error message
            error_code: Error code
            status_code: HTTP status code
            details: Additional details
            user_message: User-facing message (uses message if None)

        Returns:
            JsonResponse: Error response
        """
        response_data = {
            "success": False,
            "error": {
                "code": error_code,
                "message": user_message or message,
                "details": details or {},
            },
        }

        # Log output
        logger.error(
            f"Error response created: {error_code} - {message}",
            extra={
                "error_code": error_code,
                "status_code": status_code,
                "details": details,
            },
        )

        return JsonResponse(response_data, status=status_code)

    @staticmethod
    def handle_videoq_exception(exception: VideoQException) -> JsonResponse:
        """Process VideoQException and create error response"""
        return ErrorResponseHandler.create_error_response(
            message=exception.message,
            error_code=exception.error_code,
            status_code=500,
            details=exception.details,
        )

    @staticmethod
    def handle_validation_error(exception: DjangoValidationError) -> JsonResponse:
        """Process Django ValidationError and create error response"""
        error_messages = []
        if hasattr(exception, "message_dict"):
            for field, messages in exception.message_dict.items():
                if isinstance(messages, list):
                    error_messages.extend([f"{field}: {msg}" for msg in messages])
                else:
                    error_messages.append(f"{field}: {messages}")
        else:
            error_messages = [str(exception)]

        return ErrorResponseHandler.create_error_response(
            message="Validation error occurred",
            error_code="VALIDATION_ERROR",
            status_code=400,
            details={"validation_errors": error_messages},
        )

    @staticmethod
    def handle_general_exception(exception: Exception) -> JsonResponse:
        """Handle general exceptions and create error responses"""
        logger.exception(f"Unexpected error occurred: {str(exception)}")

        return ErrorResponseHandler.create_error_response(
            message="An unexpected error occurred",
            error_code="INTERNAL_ERROR",
            status_code=500,
            user_message="A system error occurred. Please try again after a while.",
        )


def log_operation(operation: str, user_id: Optional[int] = None, **kwargs):
    """
    Helper function to output operation logs

    Args:
        operation: Operation name
        user_id: User ID
        **kwargs: Additional log information
    """
    logger.info(
        f"Operation: {operation}",
        extra={"operation": operation, "user_id": user_id, **kwargs},
    )


def log_error(error: str, user_id: Optional[int] = None, **kwargs):
    """
    Helper function to output error logs

    Args:
        error: Error message
        user_id: User ID
        **kwargs: Additional log information
    """
    logger.error(
        f"Error: {error}", extra={"error": error, "user_id": user_id, **kwargs}
    )
