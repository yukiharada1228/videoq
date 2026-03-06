"""Auth/common dependency providers."""

from app import factories


def get_authorize_api_key_use_case():
    return factories.get_authorize_api_key_use_case()


def get_resolve_share_token_use_case():
    return factories.get_resolve_share_token_use_case()
