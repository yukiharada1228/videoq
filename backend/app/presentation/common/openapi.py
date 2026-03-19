"""OpenAPI extensions for presentation-layer authentication classes."""

from drf_spectacular.extensions import OpenApiAuthenticationExtension


def set_server_url(result, generator, request, public):
    """Preprocessing hook: inject the request's absolute root URL into servers[]."""
    if request is not None:
        result["servers"] = [{"url": request.build_absolute_uri("/").rstrip("/")}]
    return result


class APIKeyAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "app.presentation.common.authentication.APIKeyAuthentication"
    name = "ApiKeyAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "apiKey",
            "in": "header",
            "name": "X-API-Key",
            "description": "Server-to-server API key authentication.",
        }


class CookieJWTAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "app.presentation.common.authentication.CookieJWTAuthentication"
    name = "BearerAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Bearer JWT authentication. The API also accepts the access_token cookie.",
        }
