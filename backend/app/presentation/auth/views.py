from django.conf import settings
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.response import Response

from app.presentation.auth.serializers import (AccountDeleteSerializer,
                                               ApiKeyCreateResponseSerializer,
                                               ApiKeyCreateSerializer,
                                               ApiKeySerializer,
                                               EmailVerificationSerializer,
                                               LoginResponseSerializer,
                                               LoginSerializer,
                                               MessageResponseSerializer,
                                               PasswordResetConfirmSerializer,
                                               PasswordResetRequestSerializer,
                                               RefreshResponseSerializer,
                                               RefreshSerializer,
                                               UserSerializer,
                                               UserSignupSerializer)
from app.use_cases.auth.signup import EmailAlreadyRegistered
from app.use_cases.auth.verify_email import InvalidVerificationLink
from app.use_cases.auth.reset_password import InvalidResetLink
from app.use_cases.auth.exceptions import AuthenticationFailed, InvalidToken
from app.common.authentication import APIKeyAuthentication, CookieJWTAuthentication
from app.common.exceptions import ErrorCode
from app.common.responses import create_error_response, create_success_response
from app.common.throttles import (LoginIPThrottle, LoginUsernameThrottle,
                                   PasswordResetEmailThrottle,
                                   PasswordResetIPThrottle, SignupIPThrottle)
from app.container import get_container
from app.use_cases.shared.exceptions import ResourceNotFound
from app.presentation.common.mixins import AuthenticatedViewMixin, PublicViewMixin

class PublicAPIView(PublicViewMixin, generics.GenericAPIView):
    """API view that doesn't require authentication"""


class AuthenticatedAPIView(AuthenticatedViewMixin, generics.GenericAPIView):
    """API view that requires authentication"""

    authentication_classes = [CookieJWTAuthentication]


class UserSignupView(PublicAPIView):
    """User registration view"""

    serializer_class = UserSignupSerializer
    throttle_classes = [SignupIPThrottle]

    @extend_schema(
        request=UserSignupSerializer,
        responses={201: MessageResponseSerializer},
        summary="User signup",
        description="Register a new user. Verification email will be sent.",
    )
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        try:
            get_container().get_signup_use_case().execute(
                username=d["username"], email=d["email"], password=d["password"]
            )
        except EmailAlreadyRegistered as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        except Exception:
            return create_error_response(
                "Failed to send verification email. Please try again later.",
                status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return create_success_response(
            message="Verification email sent. Please check your email.",
            status_code=status.HTTP_201_CREATED,
        )


class LoginView(PublicAPIView):
    """Login view"""

    serializer_class = LoginSerializer
    throttle_classes = [LoginIPThrottle, LoginUsernameThrottle]

    @extend_schema(
        request=LoginSerializer,
        responses={200: LoginResponseSerializer},
        summary="User login",
        description="Authenticate user and return JWT tokens. Tokens are also set in HttpOnly cookies.",
    )
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        try:
            token_pair = get_container().get_login_use_case().execute(
                username=d["username"], password=d["password"]
            )
        except AuthenticationFailed:
            return create_error_response(
                "Authentication failed",
                status.HTTP_400_BAD_REQUEST,
                code=ErrorCode.AUTHENTICATION_FAILED,
            )

        response = Response({"access": token_pair.access, "refresh": token_pair.refresh})

        samesite_value = "None" if settings.SECURE_COOKIES else "Lax"

        response.set_cookie(
            key="access_token",
            value=token_pair.access,
            httponly=True,
            secure=settings.SECURE_COOKIES,
            samesite=samesite_value,
            max_age=60 * 10,
        )
        response.set_cookie(
            key="refresh_token",
            value=token_pair.refresh,
            httponly=True,
            secure=settings.SECURE_COOKIES,
            samesite=samesite_value,
            max_age=60 * 60 * 24 * 14,
        )

        return response


class LogoutView(AuthenticatedAPIView):
    """Logout view"""

    serializer_class = MessageResponseSerializer

    @extend_schema(
        responses={200: MessageResponseSerializer},
        summary="User logout",
        description="Logout by deleting HttpOnly cookies.",
    )
    def post(self, request):
        response = create_success_response(message="Logged out successfully")

        samesite_value = "None" if settings.SECURE_COOKIES else "Lax"

        response.delete_cookie(key="access_token", samesite=samesite_value)
        response.delete_cookie(key="refresh_token", samesite=samesite_value)

        return response


class AccountDeleteView(AuthenticatedAPIView):
    """Account delete (deactivate) view"""

    serializer_class = AccountDeleteSerializer

    @extend_schema(
        request=AccountDeleteSerializer,
        responses={200: MessageResponseSerializer},
        summary="Account delete",
        description=(
            "Deactivate the current user, enqueue async data deletion, "
            "and remove auth cookies."
        ),
    )
    def delete(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data.get("reason", "")

        get_container().get_delete_account_use_case().execute(request.user.id, reason)

        response = create_success_response(message="Account deletion started.")

        samesite_value = "None" if settings.SECURE_COOKIES else "Lax"

        response.delete_cookie(key="access_token", samesite=samesite_value)
        response.delete_cookie(key="refresh_token", samesite=samesite_value)

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
        refresh_token = request.COOKIES.get("refresh_token")

        if not refresh_token:
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            refresh_token = serializer.validated_data["refresh"]

        try:
            token_pair = get_container().get_refresh_token_use_case().execute(refresh_token)
        except InvalidToken:
            return create_error_response(
                message="Invalid refresh token",
                status_code=status.HTTP_401_UNAUTHORIZED,
                code=ErrorCode.AUTHENTICATION_FAILED,
            )

        response = Response({"access": token_pair.access})

        samesite_value = "None" if settings.SECURE_COOKIES else "Lax"

        response.set_cookie(
            key="access_token",
            value=token_pair.access,
            httponly=True,
            secure=settings.SECURE_COOKIES,
            samesite=samesite_value,
            max_age=60 * 10,
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
        d = serializer.validated_data
        try:
            get_container().get_verify_email_use_case().execute(
                uidb64=d["uid"], token=d["token"]
            )
        except InvalidVerificationLink as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        return create_success_response(
            message="Email verification completed. Please sign in."
        )


class PasswordResetRequestView(PublicAPIView):
    """Password reset request view"""

    serializer_class = PasswordResetRequestSerializer
    throttle_classes = [PasswordResetIPThrottle, PasswordResetEmailThrottle]

    @extend_schema(
        request=PasswordResetRequestSerializer,
        responses={200: MessageResponseSerializer},
        summary="Request password reset",
        description="Send password reset email to the specified email address.",
    )
    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        get_container().get_request_password_reset_use_case().execute(
            email=serializer.validated_data["email"]
        )
        return create_success_response(
            message="Password reset email sent. Please check your email."
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
        d = serializer.validated_data
        try:
            get_container().get_confirm_password_reset_use_case().execute(
                uidb64=d["uid"], token=d["token"], new_password=d["new_password"]
            )
        except InvalidResetLink as e:
            return create_error_response(str(e), status.HTTP_400_BAD_REQUEST)
        return create_success_response(
            message="Password reset successfully. Please sign in with your new password."
        )


class MeView(AuthenticatedAPIView, generics.RetrieveAPIView):
    """Current user information retrieval view"""

    serializer_class = UserSerializer
    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]

    def get_object(self):
        return get_container().get_current_user_use_case().execute(self.request.user.id)


class ApiKeyListCreateView(AuthenticatedAPIView, generics.GenericAPIView):
    """List and create API keys for the current user."""

    @extend_schema(
        responses={200: ApiKeySerializer(many=True)},
        summary="List API keys",
        description="List active API keys for the current user. Plain key values are never returned.",
    )
    def get(self, request, *args, **kwargs):
        keys = get_container().get_list_api_keys_use_case().execute(user_id=request.user.id)
        return Response(ApiKeySerializer(keys, many=True).data)

    @extend_schema(
        request=ApiKeyCreateSerializer,
        responses={201: ApiKeyCreateResponseSerializer},
        summary="Create API key",
        description="Create a new API key for server-to-server integrations. The plain key is returned only once.",
    )
    def post(self, request, *args, **kwargs):
        from rest_framework.exceptions import ValidationError

        serializer = ApiKeyCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = get_container().get_create_api_key_use_case().execute(
                user_id=request.user.id,
                name=serializer.validated_data["name"],
                access_level=serializer.validated_data["access_level"],
            )
        except ValueError as e:
            raise ValidationError({"name": [str(e)]})
        data = dict(ApiKeySerializer(result.api_key).data)
        data["api_key"] = result.raw_key
        return Response(data, status=status.HTTP_201_CREATED)


class ApiKeyDetailView(AuthenticatedAPIView, generics.GenericAPIView):
    """Revoke an API key."""

    @extend_schema(
        responses={200: MessageResponseSerializer},
        summary="Revoke API key",
        description="Revoke an active API key so it can no longer access the API.",
    )
    def delete(self, request, *args, **kwargs):
        pk = self.kwargs.get("pk")
        try:
            get_container().get_revoke_api_key_use_case().execute(
                key_id=int(pk), user_id=request.user.id
            )
        except ResourceNotFound:
            return create_error_response("API key not found", status.HTTP_404_NOT_FOUND)
        return create_success_response(message="API key revoked.")
