"""Common layer dependency providers."""

from app import composition_root


def get_resolve_api_key_use_case():
    return composition_root.get_resolve_api_key_use_case()
