from django.contrib.auth import get_user_model
from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.response import Response

from app.common.authentication import APIKeyAuthentication, CookieJWTAuthentication
from app.common.exceptions import ErrorCode
from app.common.responses import create_error_response, create_success_response
from app.common.throttles import (LoginIPThrottle, LoginUsernameThrottle,
                                  PasswordResetEmailThrottle,
                                  PasswordResetIPThrottle, SignupIPThrottle)
from app.models import UserApiKey
from app.auth.services import (activate_user, authenticate_credentials,
                               confirm_password_reset,
                               create_access_token, create_integration_api_key,
                               create_signup_user, create_token_pair,
                               deactivate_user_account,
                               get_active_api_keys,
                               get_current_user_with_video_count,
                               request_password_reset,
                               resolve_email_verification_user,
                               resolve_password_reset_user,
                               revoke_active_api_key)
from app.utils.email import send_email_verification, send_password_reset_email
from app.utils.mixins import AuthenticatedViewMixin, PublicViewMixin

from .serializers import (AccountDeleteSerializer,
                          ApiKeyCreateResponseSerializer,
                          ApiKeyCreateSerializer, ApiKeySerializer,
                          EmailVerificationSerializer, LoginResponseSerializer,
                          LoginSerializer, MessageResponseSerializer,
                          PasswordResetConfirmSerializer,
                          PasswordResetRequestSerializer,
                          RefreshResponseSerializer, RefreshSerializer,
                          UserSerializer, UserSignupSerializer)

User = get_user_model()


def _get_auth_cookie_samesite() -> str:
    return "None" if settings.SECURE_COOKIES else "Lax"


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str | None = None):
    samesite_value = _get_auth_cookie_samesite()
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=settings.SECURE_COOKIES,
        samesite=samesite_value,
        max_age=60 * 10,
    )

    if refresh_token is not None:
        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            secure=settings.SECURE_COOKIES,
            samesite=samesite_value,
            max_age=60 * 60 * 24 * 14,
        )


def _clear_auth_cookies(response: Response):
    samesite_value = _get_auth_cookie_samesite()
    response.delete_cookie(key="access_token", samesite=samesite_value)
    response.delete_cookie(key="refresh_token", samesite=samesite_value)


class PublicAPIView(PublicViewMixin, generics.GenericAPIView):
    """API view that doesn't require authentication"""


class AuthenticatedAPIView(AuthenticatedViewMixin, generics.GenericAPIView):
    """API view that requires authentication"""

    authentication_classes = [CookieJWTAuthentication]


class UserSignupView(generics.CreateAPIView):
    """User registration view"""

    queryset = User.objects.all()
    serializer_class = UserSignupSerializer
    permission_classes = PublicViewMixin.permission_classes
    throttle_classes = [SignupIPThrottle]

    @extend_schema(
        request=UserSignupSerializer,
        responses={201: MessageResponseSerializer},
        summary="User signup",
        description="Register a new user. Verification email will be sent.",
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            create_signup_user(
                user_model=User,
                validated_data=serializer.validated_data,
                send_verification_email=send_email_verification,
            )
        except ValueError as exc:
            return create_error_response(str(exc), status.HTTP_400_BAD_REQUEST)
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
        serializer = self.get_serializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        try:
            user = authenticate_credentials(
                username=serializer.validated_data["username"],
                password=serializer.validated_data["password"],
            )
        except ValueError as exc:
            return create_error_response(str(exc), status.HTTP_400_BAD_REQUEST)

        token_pair = create_token_pair(user=user)

        response = Response(token_pair)
        _set_auth_cookies(
            response,
            access_token=token_pair["access"],
            refresh_token=token_pair["refresh"],
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
        """Logout by deleting HttpOnly Cookie"""
        response = create_success_response(message="Logged out successfully")
        _clear_auth_cookies(response)
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

        deactivate_user_account(user=request.user, reason=reason)

        response = create_success_response(message="Account deletion started.")
        _clear_auth_cookies(response)
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
            refresh_token = serializer.validated_data["refresh"]
            try:
                access = create_access_token(refresh_token=refresh_token)
            except ValueError:
                return create_error_response(
                    message="invalid refresh",
                    status_code=status.HTTP_400_BAD_REQUEST,
                    fields={"refresh": ["invalid refresh"]},
                )
        else:
            try:
                access = create_access_token(refresh_token=refresh_token)
            except ValueError:
                return create_error_response(
                    message="Invalid refresh token",
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    code=ErrorCode.AUTHENTICATION_FAILED,
                )

        response = Response({"access": access})
        _set_auth_cookies(response, access_token=access)
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
        try:
            user = resolve_email_verification_user(
                user_model=User,
                uid=serializer.validated_data["uid"],
                token=serializer.validated_data["token"],
            )
        except ValueError as exc:
            return create_error_response(str(exc), status.HTTP_400_BAD_REQUEST)
        activate_user(user)
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
        request_password_reset(
            user_model=User,
            email=serializer.validated_data["email"],
            send_reset_email=send_password_reset_email,
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
        try:
            user = resolve_password_reset_user(
                user_model=User,
                uid=serializer.validated_data["uid"],
                token=serializer.validated_data["token"],
                new_password=serializer.validated_data["new_password"],
            )
        except ValueError as exc:
            return create_error_response(str(exc), status.HTTP_400_BAD_REQUEST)
        except DjangoValidationError as exc:
            return create_error_response(
                "Validation error",
                status.HTTP_400_BAD_REQUEST,
                fields={"new_password": exc.messages},
            )

        confirm_password_reset(
            user=user,
            new_password=serializer.validated_data["new_password"],
        )
        return create_success_response(
            message="Password reset successfully. Please sign in with your new password."
        )


class MeView(AuthenticatedAPIView, generics.RetrieveAPIView):
    """Current user information retrieval view"""

    serializer_class = UserSerializer
    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]

    def get_object(self):
        return get_current_user_with_video_count(
            user_model=User,
            user_id=self.request.user.pk,
        )


class ApiKeyListCreateView(AuthenticatedAPIView, generics.ListCreateAPIView):
    """List and create API keys for the current user."""

    serializer_class = ApiKeySerializer

    def get_queryset(self):
        return get_active_api_keys(user=self.request.user)

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ApiKeyCreateSerializer
        return ApiKeySerializer

    @extend_schema(
        responses={200: ApiKeySerializer(many=True)},
        summary="List API keys",
        description="List active API keys for the current user. Plain key values are never returned.",
    )
    def get(self, request, *args, **kwargs):
        return self.list(request, *args, **kwargs)

    @extend_schema(
        request=ApiKeyCreateSerializer,
        responses={201: ApiKeyCreateResponseSerializer},
        summary="Create API key",
        description="Create a new API key for server-to-server integrations. The plain key is returned only once.",
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            api_key, raw_key = create_integration_api_key(
                user=request.user,
                name=serializer.validated_data["name"],
                access_level=serializer.validated_data["access_level"],
            )
        except ValueError as exc:
            return create_error_response(
                str(exc),
                status.HTTP_400_BAD_REQUEST,
                fields={"name": [str(exc)]},
            )
        data = dict(ApiKeySerializer(api_key).data)
        data["api_key"] = raw_key
        return Response(data, status=status.HTTP_201_CREATED)


class ApiKeyDetailView(AuthenticatedAPIView, generics.DestroyAPIView):
    """Revoke an API key."""

    serializer_class = ApiKeySerializer

    def get_queryset(self):
        return get_active_api_keys(user=self.request.user)

    @extend_schema(
        responses={200: MessageResponseSerializer},
        summary="Revoke API key",
        description="Revoke an active API key so it can no longer access the API.",
    )
    def delete(self, request, *args, **kwargs):
        try:
            revoke_active_api_key(user=request.user, api_key_id=kwargs["pk"])
        except UserApiKey.DoesNotExist:
            return create_error_response("Not found", status.HTTP_404_NOT_FOUND)
        return create_success_response(message="API key revoked.")
