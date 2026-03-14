"""Presentation-layer rate limiting throttles."""

from rest_framework.throttling import SimpleRateThrottle

from app.domain.auth.services import normalize_signup_email


class ShareTokenIPThrottle(SimpleRateThrottle):
    scope = "chat_share_token_ip"

    def get_cache_key(self, request, view):
        share_token = request.query_params.get("share_token")
        if not share_token:
            return None
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class ShareTokenGlobalThrottle(SimpleRateThrottle):
    scope = "chat_share_token_global"

    def get_cache_key(self, request, view):
        share_token = request.query_params.get("share_token")
        if not share_token:
            return None
        return self.cache_format % {
            "scope": self.scope,
            "ident": share_token,
        }


class AuthenticatedChatThrottle(SimpleRateThrottle):
    scope = "chat_authenticated"

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        return self.cache_format % {
            "scope": self.scope,
            "ident": request.user.pk,
        }


class LoginIPThrottle(SimpleRateThrottle):
    scope = "login_ip"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class LoginUsernameThrottle(SimpleRateThrottle):
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


class SignupIPThrottle(SimpleRateThrottle):
    scope = "signup_ip"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class SignupEmailThrottle(SimpleRateThrottle):
    scope = "signup_email"

    def get_cache_key(self, request, view):
        email = request.data.get("email")
        if not email:
            ident = self.get_ident(request)
        else:
            ident = normalize_signup_email(str(email))

        return self.cache_format % {
            "scope": self.scope,
            "ident": ident,
        }


class PasswordResetIPThrottle(SimpleRateThrottle):
    scope = "password_reset_ip"

    def get_cache_key(self, request, view):
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
        }


class PasswordResetEmailThrottle(SimpleRateThrottle):
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
