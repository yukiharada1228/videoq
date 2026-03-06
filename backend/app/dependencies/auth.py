"""Auth/common dependency providers."""

from app import composition_root


def get_signup_use_case():
    return composition_root.get_signup_use_case()


def get_login_use_case():
    return composition_root.get_login_use_case()


def get_delete_account_use_case():
    return composition_root.get_delete_account_use_case()


def get_refresh_token_use_case():
    return composition_root.get_refresh_token_use_case()


def get_verify_email_use_case():
    return composition_root.get_verify_email_use_case()


def get_request_password_reset_use_case():
    return composition_root.get_request_password_reset_use_case()


def get_confirm_password_reset_use_case():
    return composition_root.get_confirm_password_reset_use_case()


def get_current_user_use_case():
    return composition_root.get_current_user_use_case()


def get_list_api_keys_use_case():
    return composition_root.get_list_api_keys_use_case()


def get_create_api_key_use_case():
    return composition_root.get_create_api_key_use_case()


def get_revoke_api_key_use_case():
    return composition_root.get_revoke_api_key_use_case()


def get_authorize_api_key_use_case():
    return composition_root.get_authorize_api_key_use_case()


def get_resolve_share_token_use_case():
    return composition_root.get_resolve_share_token_use_case()
