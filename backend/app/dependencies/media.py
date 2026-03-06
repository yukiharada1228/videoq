"""Media presentation dependency providers."""

from app import factories


def get_resolve_protected_media_use_case():
    return factories.get_resolve_protected_media_use_case()
