"""DI providers for the OAuth 2.1 context."""

from __future__ import annotations

from app.composition_root import oauth as _cr


def get_register_oauth_client_use_case():
    return _cr.get_register_oauth_client_use_case()


def get_list_authorized_tokens_use_case():
    return _cr.get_list_authorized_tokens_use_case()


def get_revoke_authorized_token_use_case():
    return _cr.get_revoke_authorized_token_use_case()
