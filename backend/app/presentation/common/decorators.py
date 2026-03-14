"""Presentation-layer view decorators."""

import logging
from functools import wraps

from rest_framework import status

from app.presentation.common.responses import create_error_response

logger = logging.getLogger(__name__)


def authenticated_api_view(methods):
    """Decorator for authenticated API views."""

    def decorator(view_func):
        from rest_framework.decorators import (
            api_view,
            authentication_classes,
            permission_classes,
        )
        from rest_framework.permissions import IsAuthenticated

        from app.presentation.common.authentication import APIKeyAuthentication, CookieJWTAuthentication
        from app.presentation.common.permissions import ApiKeyScopePermission

        wrapped_view = authentication_classes(
            [APIKeyAuthentication, CookieJWTAuthentication]
        )(
            permission_classes([IsAuthenticated, ApiKeyScopePermission])(
                api_view(methods)(view_func)
            )
        )
        return wraps(view_func)(wrapped_view)

    return decorator


def with_error_handling(view_func):
    """Common error handling decorator."""

    @wraps(view_func)
    def wrapper(*args, **kwargs):
        try:
            return view_func(*args, **kwargs)
        except Exception as e:
            logger.exception("Unhandled exception in %s", view_func.__name__)
            return create_error_response(str(e), status.HTTP_500_INTERNAL_SERVER_ERROR)

    return wrapper


def authenticated_view_with_error_handling(methods):
    """Decorator combining authentication and error handling."""

    def decorator(view_func):
        wrapped = with_error_handling(view_func)
        return authenticated_api_view(methods)(wrapped)

    return decorator
