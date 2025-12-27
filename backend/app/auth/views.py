from django.conf import settings
from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.tokens import RefreshToken

from app.utils.mixins import AuthenticatedViewMixin, PublicViewMixin

from .serializers import (AvailableModelsSerializer,
                          EmailVerificationSerializer, LLMSettingsSerializer,
                          LLMSettingsUpdateSerializer, LoginResponseSerializer,
                          LoginSerializer, MessageResponseSerializer,
                          OpenAIApiKeyMessageSerializer,
                          OpenAIApiKeySetSerializer,
                          OpenAIApiKeyStatusSerializer,
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
        return self.request.user


class SetOpenAIApiKeyView(AuthenticatedAPIView):
    """Set OpenAI API key for the authenticated user"""

    serializer_class = OpenAIApiKeySetSerializer

    @extend_schema(
        request=OpenAIApiKeySetSerializer,
        responses={200: OpenAIApiKeyMessageSerializer},
        summary="Set OpenAI API key",
        description="Set or update the user's OpenAI API key. The key will be encrypted before storage.",
    )
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response(
            {"message": "API key saved successfully"},
            status=status.HTTP_200_OK,
        )


class GetOpenAIApiKeyStatusView(AuthenticatedAPIView):
    """Get OpenAI API key status for the authenticated user"""

    serializer_class = OpenAIApiKeyStatusSerializer

    @extend_schema(
        responses={200: OpenAIApiKeyStatusSerializer},
        summary="Get OpenAI API key status",
        description="Check whether the user has set an OpenAI API key. Does not return the actual key.",
    )
    def get(self, request):
        has_api_key = bool(request.user.openai_api_key_encrypted)
        return Response(
            {"has_api_key": has_api_key},
            status=status.HTTP_200_OK,
        )


class DeleteOpenAIApiKeyView(AuthenticatedAPIView):
    """Delete OpenAI API key for the authenticated user"""

    @extend_schema(
        responses={200: OpenAIApiKeyMessageSerializer},
        summary="Delete OpenAI API key",
        description="Delete the user's OpenAI API key from the database.",
    )
    def delete(self, request):
        request.user.openai_api_key_encrypted = None
        request.user.save(update_fields=["openai_api_key_encrypted"])
        return Response(
            {"message": "API key deleted successfully"},
            status=status.HTTP_200_OK,
        )


class GetLLMSettingsView(AuthenticatedAPIView):
    """Get LLM settings for the authenticated user"""

    serializer_class = LLMSettingsSerializer

    @extend_schema(
        responses={200: LLMSettingsSerializer},
        summary="Get LLM settings",
        description="Get user's preferred LLM model and temperature settings.",
    )
    def get(self, request):
        return Response(
            {
                "preferred_llm_model": request.user.preferred_llm_model,
                "preferred_llm_temperature": request.user.preferred_llm_temperature,
            }
        )


class UpdateLLMSettingsView(AuthenticatedAPIView):
    """Update LLM settings for the authenticated user"""

    serializer_class = LLMSettingsUpdateSerializer

    @extend_schema(
        request=LLMSettingsUpdateSerializer,
        responses={200: LLMSettingsSerializer},
        summary="Update LLM settings",
        description="Update user's preferred LLM model and/or temperature.",
    )
    def patch(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)

        return Response(
            {
                "preferred_llm_model": request.user.preferred_llm_model,
                "preferred_llm_temperature": request.user.preferred_llm_temperature,
            }
        )


class ListAvailableModelsView(AuthenticatedAPIView):
    """List available chat models from OpenAI API"""

    serializer_class = AvailableModelsSerializer

    @extend_schema(
        responses={200: AvailableModelsSerializer},
        summary="List available chat models",
        description="Fetch available chat models from OpenAI API using user's API key.",
    )
    def get(self, request):
        from openai import OpenAI

        from app.utils.openai_utils import get_openai_api_key

        # Get user's API key
        api_key = get_openai_api_key(request.user)
        if not api_key:
            return Response(
                {"error": "OpenAI API key not configured"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            client = OpenAI(api_key=api_key)
            models_response = client.models.list()

            # Filter out non-chat models using blacklist approach
            # This allows new chat models to be included automatically
            NON_CHAT_PREFIXES = [
                "text-embedding",  # Embedding models
                "whisper",  # Speech-to-text
                "tts",  # Text-to-speech
                "dall-e",  # Image generation
                "gpt-audio",  # Audio I/O models
                "gpt-realtime",  # Realtime audio models
                "gpt-image",  # Image generation
                "chatgpt-image",  # Image generation
                "sora",  # Video generation
                "codex",  # Legacy code models
                "omni-moderation",  # Moderation models
                "davinci",  # Legacy completion models
                "curie",  # Legacy completion models
                "babbage",  # Legacy completion models
                "ada",  # Legacy completion models
                "o1",  # o-series models
                "o3",  # o-series models
                "o4",  # o-series models
            ]

            # Keywords to exclude if found anywhere in the model name
            NON_CHAT_KEYWORDS = [
                "-transcribe",  # Transcription models
                "-search-preview",  # Search models
                "-audio-preview",  # Audio preview models
                "-realtime-preview",  # Realtime preview models
                "-tts",  # Text-to-speech models
            ]

            NON_CHAT_EXACT = [
                "gpt-3.5-turbo-instruct",  # Legacy instruct model
            ]

            chat_models = [
                model.id
                for model in models_response.data
                if not any(model.id.startswith(prefix) for prefix in NON_CHAT_PREFIXES)
                and not any(keyword in model.id for keyword in NON_CHAT_KEYWORDS)
                and model.id not in NON_CHAT_EXACT
            ]

            # Sort for better UX (newer models first - reverse alphabetical)
            chat_models.sort(reverse=True)

            return Response({"models": chat_models})

        except Exception as e:
            return Response(
                {"error": f"Failed to fetch models: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
