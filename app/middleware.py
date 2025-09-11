import base64
from django.http import HttpResponse
from django.conf import settings


class BasicAuthMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        # Get BASIC auth enable/disable from environment variable
        self.enabled = getattr(settings, "BASIC_AUTH_ENABLED", True)
        # Get username and password from environment variable, use defaults if not available
        self.username = getattr(settings, "BASIC_AUTH_USERNAME")
        self.password = getattr(settings, "BASIC_AUTH_PASSWORD")
        # List of paths to exclude from Basic authentication
        self.exempt_paths = [
            "/health/",  # Health check endpoint
            "/share/",  # Share URL endpoint
            "/media/",  # Media file authentication handled by Django
        ]

    def __call__(self, request):
        # Skip authentication if BASIC auth is disabled
        if not self.enabled:
            return self.get_response(request)

        # Check if path is excluded
        if any(request.path.startswith(path) for path in self.exempt_paths):
            return self.get_response(request)

        auth_header = request.META.get("HTTP_AUTHORIZATION")
        if auth_header is not None and auth_header.startswith("Basic "):
            encoded_credentials = auth_header.split(" ", 1)[1].strip()
            try:
                decoded_credentials = base64.b64decode(encoded_credentials).decode(
                    "utf-8"
                )
            except Exception:
                return self.unauthorized_response()
            username, sep, password = decoded_credentials.partition(":")
            if sep and username == self.username and password == self.password:
                return self.get_response(request)
        return self.unauthorized_response()

    def unauthorized_response(self):
        response = HttpResponse("Unauthorized", status=401)
        response["WWW-Authenticate"] = 'Basic realm="Restricted"'
        return response
