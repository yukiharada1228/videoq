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
from app.auth.adapters import (CurrentUserAdapter, PasswordResetConfirmAdapter,
                               PasswordResetRequestAdapter, SignupUserAdapter,
                               VerifyEmailAdapter)
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
from app.auth.use_cases import (ConfirmPasswordResetUseCase,
                                CreateApiKeyCommand, CreateApiKeyUseCase,
                                DeleteAccountCommand, DeleteAccountUseCase,
                                GetCurrentUserQuery, GetCurrentUserUseCase,
                                LoginCommand, LoginUserUseCase,
                                PasswordResetConfirmCommand,
                                PasswordResetRequestCommand,
                                RefreshAccessTokenUseCase,
                                RefreshCommand,
                                RequestPasswordResetUseCase,
                                RevokeApiKeyCommand, RevokeApiKeyUseCase,
                                SignupCommand, SignupUserUseCase,
                                VerifyEmailCommand, VerifyEmailUseCase)
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
        use_case = SignupUserUseCase(
            signup_user_creator=SignupUserAdapter(
                user_model=User,
                send_verification_email=send_email_verification,
                signup_user_creator=create_signup_user,
            )
        )
        try:
            use_case.execute(SignupCommand(**serializer.validated_data))
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
        use_case = LoginUserUseCase(
            credential_authenticator=authenticate_credentials,
            token_pair_issuer=create_token_pair,
        )
        try:
            result = use_case.execute(
                LoginCommand(**serializer.validated_data),
            )
        except ValueError as exc:
            return create_error_response(str(exc), status.HTTP_400_BAD_REQUEST)
        response = Response({"access": result.access, "refresh": result.refresh})
        _set_auth_cookies(
            response,
            access_token=result.access,
            refresh_token=result.refresh,
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
        use_case = DeleteAccountUseCase(account_deactivator=deactivate_user_account)
        use_case.execute(DeleteAccountCommand(reason=reason), user=request.user)

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
        use_case = RefreshAccessTokenUseCase(access_token_issuer=create_access_token)

        # Get from request body if not in Cookie (backward compatibility)
        if not refresh_token:
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            refresh_token = serializer.validated_data["refresh"]
            try:
                result = use_case.execute(RefreshCommand(refresh_token=refresh_token))
            except ValueError:
                return create_error_response(
                    message="invalid refresh",
                    status_code=status.HTTP_400_BAD_REQUEST,
                    fields={"refresh": ["invalid refresh"]},
                )
        else:
            try:
                result = use_case.execute(RefreshCommand(refresh_token=refresh_token))
            except ValueError:
                return create_error_response(
                    message="Invalid refresh token",
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    code=ErrorCode.AUTHENTICATION_FAILED,
                )

        response = Response({"access": result.access})
        _set_auth_cookies(response, access_token=result.access)
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
        use_case = VerifyEmailUseCase(
            email_verification_resolver=VerifyEmailAdapter(
                user_model=User,
                email_verification_resolver=resolve_email_verification_user,
                user_activator=activate_user,
            ),
        )
        try:
            use_case.execute(VerifyEmailCommand(**serializer.validated_data))
        except ValueError as exc:
            return create_error_response(str(exc), status.HTTP_400_BAD_REQUEST)
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
        use_case = RequestPasswordResetUseCase(
            password_reset_requester=PasswordResetRequestAdapter(
                user_model=User,
                send_reset_email=send_password_reset_email,
                password_reset_requester=request_password_reset,
            )
        )
        use_case.execute(PasswordResetRequestCommand(**serializer.validated_data))
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
        use_case = ConfirmPasswordResetUseCase(
            password_reset_resolver=PasswordResetConfirmAdapter(
                user_model=User,
                password_reset_resolver=resolve_password_reset_user,
                password_reset_confirmer=confirm_password_reset,
            ),
        )
        try:
            use_case.execute(PasswordResetConfirmCommand(**serializer.validated_data))
        except ValueError as exc:
            return create_error_response(str(exc), status.HTTP_400_BAD_REQUEST)
        except DjangoValidationError as exc:
            return create_error_response(
                "Validation error",
                status.HTTP_400_BAD_REQUEST,
                fields={"new_password": exc.messages},
            )
        return create_success_response(
            message="Password reset successfully. Please sign in with your new password."
        )


class MeView(AuthenticatedAPIView, generics.RetrieveAPIView):
    """Current user information retrieval view"""

    serializer_class = UserSerializer
    authentication_classes = [APIKeyAuthentication, CookieJWTAuthentication]

    def get_object(self):
        use_case = GetCurrentUserUseCase(
            current_user_loader=CurrentUserAdapter(
                user_model=User,
                current_user_loader=get_current_user_with_video_count,
            )
        )
        return use_case.execute(GetCurrentUserQuery(user_id=self.request.user.pk))


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
        use_case = CreateApiKeyUseCase(api_key_creator=create_integration_api_key)
        try:
            result = use_case.execute(
                CreateApiKeyCommand(
                    name=serializer.validated_data["name"],
                    access_level=serializer.validated_data["access_level"],
                ),
                user=request.user,
            )
        except ValueError as exc:
            return create_error_response(
                str(exc),
                status.HTTP_400_BAD_REQUEST,
                fields={"name": [str(exc)]},
            )
        data = dict(ApiKeySerializer(result.api_key).data)
        data["api_key"] = result.raw_key
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
        use_case = RevokeApiKeyUseCase(api_key_revoker=revoke_active_api_key)
        try:
            use_case.execute(RevokeApiKeyCommand(api_key_id=kwargs["pk"]), user=request.user)
        except UserApiKey.DoesNotExist:
            return create_error_response("Not found", status.HTTP_404_NOT_FOUND)
        return create_success_response(message="API key revoked.")
