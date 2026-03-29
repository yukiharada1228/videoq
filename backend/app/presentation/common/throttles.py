"""Presentation-layer rate limiting throttles."""

from rest_framework.throttling import SimpleRateThrottle


def _normalize_throttle_identifier(value: str, *, lowercase: bool) -> str:
    normalized = value.strip()
    if lowercase:
        normalized = normalized.lower()
    return normalized


def _normalize_throttle_email(email: str) -> str:
    return _normalize_throttle_identifier(email, lowercase=True)


def _normalize_throttle_username(username: str) -> str:
    return _normalize_throttle_identifier(username, lowercase=True)


class ShareTokenIPThrottle(SimpleRateThrottle):
    scope = "chat_share_token_ip"

    def get_cache_key(self, request, view):
        share_slug = request.query_params.get("share_slug") or request.query_params.get(
            "share_token"
        ) or (
            view.kwargs.get("share_slug") if hasattr(view, "kwargs") else None
        ) or (
            view.kwargs.get("share_token") if hasattr(view, "kwargs") else None
        )
        if not share_slug:
            return None
        return self.cache_format % {
            "scope": self.scope,
            "ident": self.get_ident(request),
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
            "ident": _normalize_throttle_username(str(username)),
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
            ident = _normalize_throttle_email(str(email))

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
            "ident": _normalize_throttle_email(str(email)),
        }
