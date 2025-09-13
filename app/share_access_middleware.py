import json

from django.conf import settings
from django.http import HttpResponse, JsonResponse

from .share_access_service import ShareAccessService


class ShareAccessMiddleware:
    """Middleware to handle concurrent access limits for shared URLs"""

    def __init__(self, get_response):
        self.get_response = get_response
        self.access_service = ShareAccessService()

    def __call__(self, request):
        # Check shared URL pattern
        if self._is_share_url(request.path):
            share_token = self._extract_share_token(request.path)
            if share_token:
                return self._handle_share_access(request, share_token)

        response = self.get_response(request)
        return response

    def _is_share_url(self, path: str) -> bool:
        """Determine if it is a shared URL"""
        share_patterns = [
            "/share/group/",
        ]
        return any(pattern in path for pattern in share_patterns)

    def _extract_share_token(self, path: str) -> str:
        """Extract share_token from URL"""
        try:
            # Extract from /share/group/{share_token}/ format
            parts = path.split("/")
            if len(parts) >= 4 and parts[1] == "share" and parts[2] == "group":
                return parts[3]
        except (IndexError, AttributeError):
            pass
        return None

    def _handle_share_access(self, request, share_token: str):
        """Handle shared access"""
        # Get session ID (from cookie or header)
        session_id = self._get_session_id(request)

        if session_id:
            # Update existing session
            if self.access_service.update_session_activity(share_token, session_id):
                response = self.get_response(request)
                return response
            else:
                # If session becomes invalid, register new session
                pass

        # Register new session
        success, new_session_id, error_message = self.access_service.register_session(
            share_token
        )

        if not success:
            # When limit is reached
            if request.headers.get("Content-Type") == "application/json":
                return JsonResponse(
                    {
                        "error": error_message,
                        "max_concurrent_users": self.access_service.get_max_concurrent_users(),
                        "current_active_count": self.access_service.get_current_active_count(
                            share_token
                        ),
                    },
                    status=429,
                )
            else:
                return HttpResponse(
                    f"""
                    <html>
                    <head><title>Access Limit</title></head>
                    <body>
                        <h1>Access Limit</h1>
                        <p>{error_message}</p>
                        <p>Current concurrent access count: {self.access_service.get_current_active_count(share_token)}/{self.access_service.get_max_concurrent_users()}</p>
                    </body>
                    </html>
                    """,
                    status=429,
                    content_type="text/html; charset=utf-8",
                )

        # Set session ID in response
        response = self.get_response(request)
        response.set_cookie(
            "share_session_id",
            new_session_id,
            max_age=self.access_service.session_timeout_seconds,
            httponly=True,
            samesite="Lax",
        )

        return response

    def _get_session_id(self, request) -> str:
        """Get session ID from request"""
        # Get from cookie
        session_id = request.COOKIES.get("share_session_id")
        if session_id:
            return session_id

        # Get from header (for API requests)
        session_id = request.headers.get("X-Share-Session-ID")
        if session_id:
            return session_id

        return None

    def process_response(self, request, response):
        """Process response"""
        # For requests from shared URL with session ID set
        if self._is_share_url(request.path):
            share_token = self._extract_share_token(request.path)
            session_id = self._get_session_id(request)

            if share_token and session_id:
                # Add session ID to response header (for API)
                response["X-Share-Session-ID"] = session_id

        return response
