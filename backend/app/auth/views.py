from app.utils.mixins import AuthenticatedViewMixin, PublicViewMixin
from django.contrib.auth import get_user_model
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import (EmailVerificationSerializer, LoginSerializer,
                          PasswordResetConfirmSerializer,
                          PasswordResetRequestSerializer, RefreshSerializer,
                          UserSerializer, UserSignupSerializer,
                          UserUpdateSerializer)

User = get_user_model()


class PublicAPIView(PublicViewMixin, generics.GenericAPIView):
    """API view that doesn't require authentication"""


class AuthenticatedAPIView(AuthenticatedViewMixin, generics.GenericAPIView):
    """API view that requires authentication"""


class UserSignupView(generics.CreateAPIView):
    """User registration view"""

    queryset = User.objects.all()
    serializer_class = UserSignupSerializer
    permission_classes = PublicViewMixin.permission_classes

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        headers = self.get_success_headers(serializer.data)
        return Response(
            {"detail": "Verification email sent. Please check your email."},
            status=status.HTTP_201_CREATED,
            headers=headers,
        )


class LoginView(PublicAPIView):
    """Login view"""

    serializer_class = LoginSerializer

    def post(self, request):
        serializer = self.get_serializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        refresh = RefreshToken.for_user(user)

        response = Response(
            {"access": str(refresh.access_token), "refresh": str(refresh)}
        )

        # Set JWT token in HttpOnly Cookie
        response.set_cookie(
            key="access_token",
            value=str(refresh.access_token),
            httponly=True,
            secure=False,  # False in development, True in production
            samesite="Lax",
            max_age=60 * 10,  # 10 minutes (same as ACCESS_TOKEN_LIFETIME)
        )
        response.set_cookie(
            key="refresh_token",
            value=str(refresh),
            httponly=True,
            secure=False,  # False in development, True in production
            samesite="Lax",
            max_age=60 * 60 * 24 * 14,  # 14 days (same as REFRESH_TOKEN_LIFETIME)
        )

        return response


class LogoutView(AuthenticatedAPIView):
    """Logout view"""

    def post(self, request):
        """Logout by deleting HttpOnly Cookie"""
        response = Response({"message": "Logged out successfully"})

        # Delete HttpOnly Cookie
        response.delete_cookie("access_token")
        response.delete_cookie("refresh_token")

        return response


class RefreshView(PublicAPIView):
    """Token refresh view"""

    serializer_class = RefreshSerializer

    def post(self, request):
        # Get refresh token from Cookie (priority)
        refresh_token = request.COOKIES.get("refresh_token")

        # Get from request body if not in Cookie (backward compatibility)
        if not refresh_token:
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            refresh = serializer.validated_data["refresh_obj"]
        else:
            # Verify token obtained from Cookie
            try:
                refresh = RefreshToken(refresh_token)
            except InvalidToken:
                return Response(
                    {"detail": "Invalid refresh token"},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

        access = refresh.access_token

        response = Response({"access": str(access)})

        # Set new access_token in HttpOnly Cookie
        response.set_cookie(
            key="access_token",
            value=str(access),
            httponly=True,
            secure=False,  # False in development, True in production
            samesite="Lax",
            max_age=60 * 10,  # 10 minutes (same as ACCESS_TOKEN_LIFETIME)
        )

        return response


class EmailVerificationView(PublicAPIView):
    """Email verification completion view"""

    serializer_class = EmailVerificationSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Email verification completed. Please sign in."})


class PasswordResetRequestView(PublicAPIView):
    """Password reset request view"""

    serializer_class = PasswordResetRequestSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {
                "detail": "Password reset email sent. Please check your email."
            }
        )


class PasswordResetConfirmView(PublicAPIView):
    """Password reset confirmation view"""

    serializer_class = PasswordResetConfirmSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {
                "detail": "Password reset successfully. Please sign in with your new password."
            }
        )


class MeView(AuthenticatedAPIView, generics.RetrieveUpdateAPIView):
    """Current user information retrieval and update view"""

    def get_serializer_class(self):
        if self.request.method == "PUT" or self.request.method == "PATCH":
            return UserUpdateSerializer
        return UserSerializer

    def get_object(self):
        return self.request.user
