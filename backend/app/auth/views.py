from app.utils.mixins import AuthenticatedViewMixin, PublicViewMixin
from app.utils.plan_limits import (
    get_chat_limit,
    get_first_day_of_month,
    get_monthly_chat_count,
    get_monthly_whisper_usage,
    get_video_limit,
    get_whisper_minutes_limit,
)
from django.contrib.auth import get_user_model
from django.db.models import Q
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import (EmailVerificationSerializer, LoginResponseSerializer,
                          LoginSerializer, MessageResponseSerializer,
                          PasswordResetConfirmSerializer,
                          PasswordResetRequestSerializer,
                          RefreshResponseSerializer,
                          RefreshSerializer, UsageStatsResponseSerializer,
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
            secure=False,  # False in development, True in production
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
        return self.request.user


class UsageStatsView(AuthenticatedAPIView):
    """Usage statistics retrieval view"""

    @extend_schema(
        responses={200: UsageStatsResponseSerializer},
        summary="Get usage statistics",
        description="Retrieve current usage statistics for videos, Whisper processing time, and chats.",
    )
    def get(self, request):
        from app.models import Video

        user = request.user

        # Calculate video count (exclude deleted videos)
        video_count = Video.objects.filter(user=user, deleted_at__isnull=True).count()
        video_limit = get_video_limit(user)

        # Calculate monthly Whisper usage (in minutes)
        # N+1 prevention: Use common utility function
        monthly_whisper_usage = get_monthly_whisper_usage(user)
        whisper_limit = get_whisper_minutes_limit(user)

        # Calculate monthly chat count
        # N+1 prevention: Use common utility function
        monthly_chat_count = get_monthly_chat_count(user)
        chat_limit = get_chat_limit(user)

        return Response(
            {
                "videos": {"used": video_count, "limit": video_limit},
                "whisper_minutes": {"used": monthly_whisper_usage, "limit": whisper_limit},
                "chats": {"used": monthly_chat_count, "limit": chat_limit},
            }
        )
