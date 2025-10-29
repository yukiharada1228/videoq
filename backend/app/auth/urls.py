from django.urls import path

from .views import LoginView, LogoutView, MeView, RefreshView, UserSignupView

urlpatterns = [
    path("signup/", UserSignupView.as_view(), name="signup"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("me/", MeView.as_view(), name="auth-me"),
]
