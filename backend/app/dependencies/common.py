"""Common layer dependency providers."""

from app.composition_root import auth as _cr


def get_resolve_api_key_use_case():
    return _cr.get_resolve_api_key_use_case()


def get_cookie_jwt_validator():
    return _cr.get_cookie_jwt_validator()
