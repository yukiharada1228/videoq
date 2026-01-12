from django.conf import settings
from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.tokens import RefreshToken

from app.utils.mixins import AuthenticatedViewMixin, PublicViewMixin

from .serializers import (EmailVerificationSerializer, LoginResponseSerializer,
                          LoginSerializer, MessageResponseSerializer,
                          PasswordResetConfirmSerializer,
                          PasswordResetRequestSerializer,
                          RefreshResponseSerializer, RefreshSerializer,
                          UserSerializer, UserSignupSerializer)

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

    @extend_schema(
        request=UserSignupSerializer,
        responses={201: MessageResponseSerializer},
        summary="User signup",
        description="Register a new user. Verification email will be sent.",
    )
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

    @extend_schema(
        request=LoginSerializer,
        responses={200: LoginResponseSerializer},
        summary="User login",
        description="Authenticate user and return JWT tokens. Tokens are also set in HttpOnly cookies.",
    )
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
            secure=settings.SECURE_COOKIES,  # Controlled by SECURE_COOKIES env var
            samesite="Lax",
            max_age=60 * 10,  # 10 minutes (same as ACCESS_TOKEN_LIFETIME)
        )
        response.set_cookie(
            key="refresh_token",
            value=str(refresh),
            httponly=True,
            secure=settings.SECURE_COOKIES,  # Controlled by SECURE_COOKIES env var
            samesite="Lax",
            max_age=60 * 60 * 24 * 14,  # 14 days (same as REFRESH_TOKEN_LIFETIME)
        )

        return response


class LogoutView(AuthenticatedAPIView):
    """Logout view"""

    @extend_schema(
        responses={200: MessageResponseSerializer},
        summary="User logout",
        description="Logout by deleting HttpOnly cookies.",
    )
    def post(self, request):
        """Logout by deleting HttpOnly Cookie"""
        response = Response({"detail": "Logged out successfully"})

        # Delete HttpOnly Cookie
        response.delete_cookie("access_token")
        response.delete_cookie("refresh_token")

        return response


class RefreshView(PublicAPIView):
    """Token refresh view"""

    serializer_class = RefreshSerializer

    @extend_schema(
        request=RefreshSerializer,
        responses={200: RefreshResponseSerializer, 401: MessageResponseSerializer},
        summary="Refresh access token",
        description="Refresh access token using refresh token from cookie or request body.",
    )
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
            secure=settings.SECURE_COOKIES,  # Controlled by SECURE_COOKIES env var
            samesite="Lax",
            max_age=60 * 10,  # 10 minutes (same as ACCESS_TOKEN_LIFETIME)
        )

        return response


class EmailVerificationView(PublicAPIView):
    """Email verification completion view"""

    serializer_class = EmailVerificationSerializer

    @extend_schema(
        request=EmailVerificationSerializer,
        responses={200: MessageResponseSerializer},
        summary="Verify email",
        description="Complete email verification using uid and token from verification link.",
    )
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Email verification completed. Please sign in."})


class PasswordResetRequestView(PublicAPIView):
    """Password reset request view"""

    serializer_class = PasswordResetRequestSerializer

    @extend_schema(
        request=PasswordResetRequestSerializer,
        responses={200: MessageResponseSerializer},
        summary="Request password reset",
        description="Send password reset email to the specified email address.",
    )
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"detail": "Password reset email sent. Please check your email."}
        )


class PasswordResetConfirmView(PublicAPIView):
    """Password reset confirmation view"""

    serializer_class = PasswordResetConfirmSerializer

    @extend_schema(
        request=PasswordResetConfirmSerializer,
        responses={200: MessageResponseSerializer},
        summary="Confirm password reset",
        description="Reset password using uid, token, and new password from reset link.",
    )
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {
                "detail": "Password reset successfully. Please sign in with your new password."
            }
        )


class MeView(AuthenticatedAPIView, generics.RetrieveAPIView):
    """Current user information retrieval view"""

    serializer_class = UserSerializer

    def get_object(self):
        from django.db.models import Count

        return User.objects.annotate(video_count=Count("videos")).get(
            pk=self.request.user.pk
        )
