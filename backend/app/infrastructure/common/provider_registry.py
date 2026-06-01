"""Shared helpers for provider-backed infrastructure factories."""

from collections.abc import Callable, Iterable, Mapping
from typing import TypeVar

from django.conf import settings

from app.domain.shared.exceptions import ProviderConfigError

T = TypeVar("T")


def normalize_provider(value: object, default: str) -> str:
    """Normalize provider names from Django settings."""
    if value is None:
        value = default
    return str(value).strip().lower()


def get_provider_setting(setting_name: str, default: str) -> str:
    """Read a provider setting from Django settings and normalize it."""
    return normalize_provider(getattr(settings, setting_name, default), default)


def validate_provider(
    setting_name: str,
    provider: object,
    allowed_providers: Iterable[str],
) -> str:
    """Validate a provider name against a registry's known keys."""
    normalized_provider = normalize_provider(provider, "")
    allowed = tuple(allowed_providers)
    if normalized_provider in allowed:
        return normalized_provider

    raise ProviderConfigError(
        f"Invalid {setting_name}: {provider}. "
        f"Must be {_format_allowed_providers(allowed)}."
    )


def create_from_provider_registry(
    setting_name: str,
    provider: object,
    registry: Mapping[str, Callable[[], T]],
) -> T:
    """Create a provider-backed object from a registry of builder strategies."""
    normalized_provider = validate_provider(setting_name, provider, registry.keys())
    return registry[normalized_provider]()


def resolve_openai_api_key(
    api_key: str | None = None,
    *,
    allow_settings_fallback: bool = True,
    purpose: str = "OpenAI provider",
) -> str:
    """Resolve an OpenAI API key from an explicit value or Django settings."""
    resolved_key = api_key
    if not resolved_key and allow_settings_fallback:
        resolved_key = getattr(settings, "OPENAI_API_KEY", None)

    if not resolved_key:
        raise ProviderConfigError(
            f"OpenAI API key is required when using {purpose}. "
            "Please set OPENAI_API_KEY in the server environment."
        )

    return resolved_key


def _format_allowed_providers(providers: Iterable[str]) -> str:
    quoted_providers = [f"'{provider}'" for provider in sorted(providers)]
    if len(quoted_providers) == 1:
        return quoted_providers[0]
    return f"{', '.join(quoted_providers[:-1])} or {quoted_providers[-1]}"
