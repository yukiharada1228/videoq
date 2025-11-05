"""共通のミックスイン"""

from app.common.authentication import CookieJWTAuthentication
from rest_framework.permissions import AllowAny, IsAuthenticated


class AuthenticatedViewMixin:
    """認証必須の共通ミックスイン"""

    permission_classes = [IsAuthenticated]
    authentication_classes = [CookieJWTAuthentication]

    def get_serializer_context(self):
        """シリアライザーにリクエストコンテキストを渡す"""
        context = super().get_serializer_context()
        context["request"] = self.request
        return context


class PublicViewMixin:
    """認証不要の共通ミックスイン"""

    permission_classes = [AllowAny]


class DynamicSerializerMixin:
    """動的にシリアライザーを切り替える共通ミックスイン"""

    def get_serializer_class(self):
        """リクエストのメソッドに応じてシリアライザーを変更"""
        if not hasattr(self, "serializer_map") or not self.serializer_map:
            # serializer_mapがない場合は、従来の方法を試す
            if hasattr(self, "serializer_class") and self.serializer_class:
                return self.serializer_class
            return super().get_serializer_class()

        method = self.request.method
        serializer_class = self.serializer_map.get(method)

        if serializer_class:
            return serializer_class

        # マッチしない場合はデフォルト（最初の値）を使用
        return next(iter(self.serializer_map.values()))
