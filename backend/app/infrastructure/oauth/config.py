"""Settings-derived configuration for the OAuth 2.1 context."""

from __future__ import annotations

from django.conf import settings


def get_allowed_scopes() -> tuple[str, ...]:
    """Return the OAuth scopes configured via ``settings.OAUTH2_PROVIDER``."""

    return tuple((settings.OAUTH2_PROVIDER.get("SCOPES") or {}).keys())
