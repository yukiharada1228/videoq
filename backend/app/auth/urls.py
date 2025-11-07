from django.conf import settings
from django.urls import path

from .views import (EmailVerificationView, LoginView, LogoutView, MeView,
                    PasswordChangeView, RefreshView, UserSignupView)

urlpatterns = [
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("me/", MeView.as_view(), name="auth-me"),
    path("verify-email/", EmailVerificationView.as_view(), name="auth-verify-email"),
    path(
        "password/change/",
        PasswordChangeView.as_view(),
        name="auth-password-change",
    ),
]

# 環境変数でサインアップ機能をオン/オフ
if settings.ENABLE_SIGNUP:
    urlpatterns.append(path("signup/", UserSignupView.as_view(), name="signup"))
