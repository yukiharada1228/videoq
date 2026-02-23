"""
Rate limiting throttles for API abuse prevention.

Provides differentiated rate limits:
- Authenticated users get standard limits
- Share token (anonymous) access gets stricter limits to prevent API cost attacks
"""

from rest_framework.throttling import SimpleRateThrottle


class ChatUserRateThrottle(SimpleRateThrottle):
    """Rate limit for authenticated chat users."""

    scope = "chat_user"
    rate = "30/minute"

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            return self.cache_format % {
                "scope": self.scope,
                "ident": request.user.pk,
            }
        return None


class ChatShareTokenRateThrottle(SimpleRateThrottle):
    """
    Rate limit for share token (anonymous) chat access.

    Prevents API cost attacks where an attacker uses a shared URL
    to make excessive LLM API calls billed to the group owner.
    Rate is per share_token + IP combination.
    """

    scope = "chat_shared"
    rate = "120/hour"

    def get_cache_key(self, request, view):
        share_token = request.query_params.get("share_token")
        if not share_token:
            return None
        ident = f"{share_token}_{self.get_ident(request)}"
        return self.cache_format % {
            "scope": self.scope,
            "ident": ident,
        }


class ChatShareTokenBurstThrottle(SimpleRateThrottle):
    """
    Short-term burst limit for share token access.
    Prevents rapid-fire requests even within the hourly limit.
    """

    scope = "chat_shared_burst"
    rate = "20/minute"

    def get_cache_key(self, request, view):
        share_token = request.query_params.get("share_token")
        if not share_token:
            return None
        ident = f"{share_token}_{self.get_ident(request)}"
        return self.cache_format % {
            "scope": self.scope,
            "ident": ident,
        }
