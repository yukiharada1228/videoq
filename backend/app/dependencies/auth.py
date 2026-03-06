"""Auth/common dependency providers."""

from app import factories


def get_signup_use_case():
    return factories.get_signup_use_case()


def get_login_use_case():
    return factories.get_login_use_case()


def get_delete_account_use_case():
    return factories.get_delete_account_use_case()


def get_refresh_token_use_case():
    return factories.get_refresh_token_use_case()


def get_verify_email_use_case():
    return factories.get_verify_email_use_case()


def get_request_password_reset_use_case():
    return factories.get_request_password_reset_use_case()


def get_confirm_password_reset_use_case():
    return factories.get_confirm_password_reset_use_case()


def get_current_user_use_case():
    return factories.get_current_user_use_case()


def get_list_api_keys_use_case():
    return factories.get_list_api_keys_use_case()


def get_create_api_key_use_case():
    return factories.get_create_api_key_use_case()


def get_revoke_api_key_use_case():
    return factories.get_revoke_api_key_use_case()


def get_authorize_api_key_use_case():
    return factories.get_authorize_api_key_use_case()


def get_resolve_share_token_use_case():
    return factories.get_resolve_share_token_use_case()
