"""Media presentation dependency providers."""

from app.composition_root import media as _cr


def get_resolve_protected_media_use_case():
    return _cr.get_resolve_protected_media_use_case()
