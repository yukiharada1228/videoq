from django.conf import settings
from django.urls import path

from app.dependencies import auth as auth_dependencies

from .views import (
    AccountDeleteView,
    ApiKeyDetailView,
    ApiKeyListCreateView,
    EmailVerificationView,
    LoginView,
    LogoutView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RefreshView,
    UserSignupView,
)

urlpatterns = [
    path(
        "login/",
        LoginView.as_view(login_use_case=auth_dependencies.get_login_use_case),
        name="auth-login",
    ),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path(
        "account/",
        AccountDeleteView.as_view(
            delete_account_use_case=auth_dependencies.get_delete_account_use_case
        ),
        name="auth-account-delete",
    ),
    path(
        "refresh/",
        RefreshView.as_view(
            refresh_token_use_case=auth_dependencies.get_refresh_token_use_case
        ),
        name="auth-refresh",
    ),
    path(
        "me/",
        MeView.as_view(current_user_use_case=auth_dependencies.get_current_user_use_case),
        name="auth-me",
    ),
    path(
        "api-keys/",
        ApiKeyListCreateView.as_view(
            list_api_keys_use_case=auth_dependencies.get_list_api_keys_use_case,
            create_api_key_use_case=auth_dependencies.get_create_api_key_use_case,
        ),
        name="auth-api-keys",
    ),
    path(
        "api-keys/<int:pk>/",
        ApiKeyDetailView.as_view(
            revoke_api_key_use_case=auth_dependencies.get_revoke_api_key_use_case
        ),
        name="auth-api-key-detail",
    ),
    path(
        "verify-email/",
        EmailVerificationView.as_view(
            verify_email_use_case=auth_dependencies.get_verify_email_use_case
        ),
        name="auth-verify-email",
    ),
    path(
        "password-reset/",
        PasswordResetRequestView.as_view(
            request_password_reset_use_case=(
                auth_dependencies.get_request_password_reset_use_case
            )
        ),
        name="auth-password-reset",
    ),
    path(
        "password-reset/confirm/",
        PasswordResetConfirmView.as_view(
            confirm_password_reset_use_case=(
                auth_dependencies.get_confirm_password_reset_use_case
            )
        ),
        name="auth-password-reset-confirm",
    ),
]

if settings.ENABLE_SIGNUP:
    urlpatterns.append(
        path(
            "signup/",
            UserSignupView.as_view(signup_use_case=auth_dependencies.get_signup_use_case),
            name="signup",
        )
    )
