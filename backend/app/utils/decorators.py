from functools import wraps

from rest_framework import status

from app.common.responses import create_error_response


def authenticated_api_view(methods):
    """Decorator for authenticated API views"""

    def decorator(view_func):
        from rest_framework.decorators import api_view, permission_classes

        from app.utils.mixins import AuthenticatedViewMixin

        return permission_classes(AuthenticatedViewMixin.permission_classes)(
            api_view(methods)(view_func)
        )

    return decorator


def with_error_handling(view_func):
    """Common error handling decorator"""

    @wraps(view_func)
    def wrapper(*args, **kwargs):
        try:
            return view_func(*args, **kwargs)
        except Exception as e:
            return create_error_response(str(e), status.HTTP_500_INTERNAL_SERVER_ERROR)

    return wrapper


def authenticated_view_with_error_handling(methods):
    """Decorator combining authentication and error handling"""

    def decorator(view_func):
        # Apply error handling first, then authentication
        wrapped = with_error_handling(view_func)
        return authenticated_api_view(methods)(wrapped)

    return decorator
