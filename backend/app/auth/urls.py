from django.conf import settings
from django.urls import path

from .views import (DeleteOpenAIApiKeyView, EmailVerificationView,
                    GetLLMSettingsView, GetOpenAIApiKeyStatusView,
                    ListAvailableModelsView, LoginView, LogoutView, MeView,
                    PasswordResetConfirmView, PasswordResetRequestView,
                    RefreshView, SetOpenAIApiKeyView, UpdateLLMSettingsView,
                    UserSignupView)

urlpatterns = [
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("me/", MeView.as_view(), name="auth-me"),
    path(
        "me/openai-api-key/",
        SetOpenAIApiKeyView.as_view(),
        name="auth-set-openai-api-key",
    ),
    path(
        "me/openai-api-key/status/",
        GetOpenAIApiKeyStatusView.as_view(),
        name="auth-get-openai-api-key-status",
    ),
    path(
        "me/openai-api-key/delete/",
        DeleteOpenAIApiKeyView.as_view(),
        name="auth-delete-openai-api-key",
    ),
    path(
        "me/llm-settings/",
        GetLLMSettingsView.as_view(),
        name="auth-get-llm-settings",
    ),
    path(
        "me/llm-settings/update/",
        UpdateLLMSettingsView.as_view(),
        name="auth-update-llm-settings",
    ),
    path(
        "me/llm-settings/available-models/",
        ListAvailableModelsView.as_view(),
        name="auth-list-available-models",
    ),
    path("verify-email/", EmailVerificationView.as_view(), name="auth-verify-email"),
    path(
        "password-reset/",
        PasswordResetRequestView.as_view(),
        name="auth-password-reset",
    ),
    path(
        "password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="auth-password-reset-confirm",
    ),
]

# Enable/disable signup feature via environment variable
if settings.ENABLE_SIGNUP:
    urlpatterns.append(path("signup/", UserSignupView.as_view(), name="signup"))
