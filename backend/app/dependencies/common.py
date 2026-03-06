"""Common layer dependency providers."""

from app import factories


def get_resolve_api_key_use_case():
    return factories.get_resolve_api_key_use_case()
