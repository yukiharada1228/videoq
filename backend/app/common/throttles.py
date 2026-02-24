"""Rate limiting throttle classes for API protection.

Two-tier throttling strategy:
- Chat (share_token): IP-based + token-based limits to prevent API cost abuse
- Chat (authenticated): Per-user limits
- Auth endpoints: IP-based + identifier-based limits to prevent brute force
"""

from rest_framework.throttling import SimpleRateThrottle

# ---------------------------------------------------------------------------
# Chat throttles (share_token — two-tier)
# ---------------------------------------------------------------------------


class ShareTokenIPThrottle(SimpleRateThrottle):
    """Per-IP rate limit for share_token chat requests."""

    scope = "chat_share_token_ip"

    def get_cache_key(self, request, view):
        share_token = request.query_params.get("share_token")
        if not share_token:
            return None  # skip — not a share_token request
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class ShareTokenGlobalThrottle(SimpleRateThrottle):
    """Per-token rate limit for share_token chat requests."""

    scope = "chat_share_token_global"

    def get_cache_key(self, request, view):
        share_token = request.query_params.get("share_token")
        if not share_token:
            return None  # skip — not a share_token request
        return self.cache_format % {
            "scope": self.scope,
            "ident": share_token,
        }


# ---------------------------------------------------------------------------
# Chat throttle (authenticated user)
# ---------------------------------------------------------------------------


class AuthenticatedChatThrottle(SimpleRateThrottle):
    """Per-user rate limit for authenticated chat requests."""

    scope = "chat_authenticated"

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None  # skip — not an authenticated request
        return self.cache_format % {
            "scope": self.scope,
            "ident": request.user.pk,
        }


# ---------------------------------------------------------------------------
# Login throttles (two-tier)
# ---------------------------------------------------------------------------


class LoginIPThrottle(SimpleRateThrottle):
    """Per-IP rate limit for login attempts."""

    scope = "login_ip"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class LoginUsernameThrottle(SimpleRateThrottle):
    """Per-username rate limit for login attempts."""

    scope = "login_username"

    def get_cache_key(self, request, view):
        username = request.data.get("username")
        if not username:
            return self.cache_format % {
                "scope": self.scope,
                "ident": self.get_ident(request),
            }
        return self.cache_format % {
            "scope": self.scope,
            "ident": username,
        }


# ---------------------------------------------------------------------------
# Signup throttle
# ---------------------------------------------------------------------------


class SignupIPThrottle(SimpleRateThrottle):
    """Per-IP rate limit for signup requests."""

    scope = "signup_ip"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


# ---------------------------------------------------------------------------
# Password reset throttles (two-tier)
# ---------------------------------------------------------------------------


class PasswordResetIPThrottle(SimpleRateThrottle):
    """Per-IP rate limit for password reset requests."""

    scope = "password_reset_ip"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class PasswordResetEmailThrottle(SimpleRateThrottle):
    """Per-email rate limit for password reset requests."""

    scope = "password_reset_email"

    def get_cache_key(self, request, view):
        email = request.data.get("email")
        if not email:
            return self.cache_format % {
                "scope": self.scope,
                "ident": self.get_ident(request),
            }
        return self.cache_format % {
            "scope": self.scope,
            "ident": email,
        }
