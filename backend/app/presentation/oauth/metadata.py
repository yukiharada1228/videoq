"""Helpers for the RFC 8414 / RFC 9728 metadata documents."""

from __future__ import annotations

from django.conf import settings
from django.urls import reverse


def _issuer() -> str:
    return getattr(settings, "OAUTH2_PROVIDER_ISSUER_URL", "").rstrip("/")


def _abs(path: str) -> str:
    return f"{_issuer()}{path}"


def authorization_server_metadata() -> dict:
    scopes = list((settings.OAUTH2_PROVIDER.get("SCOPES") or {}).keys())
    return {
        "issuer": _issuer(),
        "authorization_endpoint": _abs(reverse("oauth2_provider:authorize")),
        "token_endpoint": _abs(reverse("oauth2_provider:token")),
        "registration_endpoint": _abs(reverse("oauth-register")),
        "revocation_endpoint": _abs(reverse("oauth2_provider:revoke-token")),
        "scopes_supported": scopes,
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": [
            "none",
            "client_secret_basic",
            "client_secret_post",
        ],
        "service_documentation": (
            "https://github.com/yukiharada1228/videoq#mcp-remote-endpoint"
        ),
    }


def protected_resource_metadata(resource_path: str = "/api/mcp/") -> dict:
    return {
        "resource": _abs(resource_path),
        "authorization_servers": [_issuer()],
        "bearer_methods_supported": ["header"],
        "scopes_supported": list(
            (settings.OAUTH2_PROVIDER.get("SCOPES") or {}).keys()
        ),
        "resource_documentation": (
            "https://github.com/yukiharada1228/videoq#mcp-remote-endpoint"
        ),
    }
