"""OpenAPI extensions for presentation-layer authentication classes."""

from drf_spectacular.extensions import OpenApiAuthenticationExtension


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
