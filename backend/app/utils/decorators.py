from functools import wraps
from rest_framework import status
from app.utils.responses import create_error_response


def authenticated_api_view(methods):
    """認証必須のAPIビューデコレーター（DRY原則）"""
    def decorator(view_func):
        from rest_framework.decorators import api_view, permission_classes
        from app.utils.mixins import AuthenticatedViewMixin
        
        return permission_classes(AuthenticatedViewMixin.permission_classes)(
            api_view(methods)(view_func)
        )
    return decorator

def with_error_handling(view_func):
    """共通のエラーハンドリングデコレーター（DRY原則）"""
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        try:
            return view_func(*args, **kwargs)
        except Exception as e:
            return create_error_response(str(e), status.HTTP_500_INTERNAL_SERVER_ERROR)
    return wrapper

def authenticated_view_with_error_handling(methods):
    """認証とエラーハンドリングを組み合わせたデコレーター（DRY原則）"""
    def decorator(view_func):
        # エラーハンドリングを最初に適用し、次に認証を適用
        wrapped = with_error_handling(view_func)
        return authenticated_api_view(methods)(wrapped)
    return decorator
