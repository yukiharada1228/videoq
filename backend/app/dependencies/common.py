"""Common layer dependency providers."""

from app.composition_root import auth as _cr


def get_resolve_api_key_use_case():
    return _cr.get_resolve_api_key_use_case()
