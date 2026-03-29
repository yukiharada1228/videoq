"""Auth/common dependency providers."""

from app.composition_root import auth as _cr


def get_signup_use_case():
    return _cr.get_signup_use_case()


def get_login_use_case():
    return _cr.get_login_use_case()


def get_delete_account_use_case():
    return _cr.get_delete_account_use_case()


def get_refresh_token_use_case():
    return _cr.get_refresh_token_use_case()


def get_logout_use_case():
    return _cr.get_logout_use_case()


def get_verify_email_use_case():
    return _cr.get_verify_email_use_case()


def get_request_password_reset_use_case():
    return _cr.get_request_password_reset_use_case()


def get_confirm_password_reset_use_case():
    return _cr.get_confirm_password_reset_use_case()


def get_current_user_use_case():
    return _cr.get_current_user_use_case()


def get_list_api_keys_use_case():
    return _cr.get_list_api_keys_use_case()


def get_create_api_key_use_case():
    return _cr.get_create_api_key_use_case()


def get_revoke_api_key_use_case():
    return _cr.get_revoke_api_key_use_case()


def get_searchapi_key_status_use_case():
    return _cr.get_searchapi_key_status_use_case()


def get_set_searchapi_key_use_case():
    return _cr.get_set_searchapi_key_use_case()


def get_delete_searchapi_key_use_case():
    return _cr.get_delete_searchapi_key_use_case()


def get_authorize_api_key_use_case():
    return _cr.get_authorize_api_key_use_case()


def get_resolve_share_token_use_case():
    return _cr.get_resolve_share_token_use_case()
