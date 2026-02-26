from django.conf import settings
from django.urls import path

from .views import (AccountDeleteView, EmailVerificationView, LoginView,
                    LogoutView, MeView, PasswordResetConfirmView,
                    PasswordResetRequestView, RefreshView, UserSignupView)

urlpatterns = [
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("account/", AccountDeleteView.as_view(), name="auth-account-delete"),
    path("refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("me/", MeView.as_view(), name="auth-me"),
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
