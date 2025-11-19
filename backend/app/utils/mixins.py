"""Common mixins"""

from rest_framework.permissions import AllowAny, IsAuthenticated

from app.common.authentication import CookieJWTAuthentication


class AuthenticatedViewMixin:
    """Common mixin for authenticated views"""

    permission_classes = [IsAuthenticated]
    authentication_classes = [CookieJWTAuthentication]

    def get_serializer_context(self):
        """Pass request context to serializer"""
        context = super().get_serializer_context()
        context["request"] = self.request
        return context


class PublicViewMixin:
    """Common mixin for public views (no authentication required)"""

    permission_classes = [AllowAny]


class DynamicSerializerMixin:
    """Common mixin to dynamically switch serializers"""

    def get_serializer_class(self):
        """Change serializer based on request method"""
        if not hasattr(self, "serializer_map") or not self.serializer_map:
            # If serializer_map doesn't exist, try the conventional method
            if hasattr(self, "serializer_class") and self.serializer_class:
                return self.serializer_class
            return super().get_serializer_class()

        method = self.request.method
        serializer_class = self.serializer_map.get(method)

        if serializer_class:
            return serializer_class

        # Use default (first value) if no match
        return next(iter(self.serializer_map.values()))
