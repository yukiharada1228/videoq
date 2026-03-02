from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from app.auth import repositories
from app.models import UserApiKey
from app.tasks.account_deletion import delete_account_data


def authenticate_credentials(*, username: str, password: str):
    """Authenticate a user from raw credentials."""
    if not username or not password:
        raise ValueError("username and password are required")

    user = authenticate(username=username, password=password)
    if user is None:
        raise ValueError("Authentication failed")
    return user


def create_token_pair(*, user) -> dict[str, str]:
    """Issue a fresh access/refresh token pair for the given user."""
    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }


def create_access_token(*, refresh_token: str) -> str:
    """Issue a new access token from an existing refresh token."""
    try:
        refresh = RefreshToken(refresh_token)
    except (InvalidToken, TokenError) as exc:
        raise ValueError("Invalid refresh token") from exc

    return str(refresh.access_token)


def deactivate_user_account(*, user, reason: str):
    """Deactivate a user, record the request, and enqueue async cleanup."""
    repositories.create_account_deletion_request(user=user, reason=reason)

    now = timezone.now()
    suffix = now.strftime("%Y%m%d%H%M%S")
    user.is_active = False
    user.deactivated_at = now
    user.username = f"deleted__{user.id}__{suffix}"
    user.email = f"deleted__{user.id}__{suffix}@invalid.local"
    user.save(
        update_fields=["is_active", "deactivated_at", "username", "email"]
    )

    delete_account_data.delay(user.id)


def create_integration_api_key(*, user, name: str, access_level: str):
    """Create a new integration API key and return the model plus raw key."""
    if repositories.has_active_api_key_with_name(user=user, name=name):
        raise ValueError("An active API key with this name already exists.")

    return UserApiKey.create_for_user(
        user=user,
        name=name,
        access_level=access_level,
    )


def create_signup_user(*, user_model, validated_data, send_verification_email):
    """Create an inactive user and send the verification email."""
    with transaction.atomic():
        user = user_model.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            is_active=False,
        )
        try:
            send_verification_email(user)
        except Exception as exc:
            raise ValueError(
                "Failed to send verification email. Please try again later."
            ) from exc
    return user


def request_password_reset(*, user_model, email: str, send_reset_email):
    """Send a password reset email for an active user if present."""
    user = repositories.get_active_user_by_email(user_model=user_model, email=email)
    if not user:
        return None

    send_reset_email(user)
    return user


def confirm_password_reset(*, user, new_password: str):
    """Persist a new password for the given user."""
    user.set_password(new_password)
    user.save(update_fields=["password"])
    return user


def activate_user(user):
    """Activate a user account if still inactive."""
    if not user.is_active:
        user.is_active = True
        user.save(update_fields=["is_active"])
    return user


def resolve_email_verification_user(*, user_model, uid: str, token: str):
    """Resolve and validate a user from an email verification link."""
    try:
        user_id = force_str(urlsafe_base64_decode(uid))
        user = repositories.get_user_by_id(user_model=user_model, user_id=user_id)
    except (TypeError, ValueError, OverflowError, user_model.DoesNotExist) as exc:
        raise ValueError("Invalid verification link.") from exc

    if not default_token_generator.check_token(user, token):
        raise ValueError("Token is invalid or has expired.")

    return user


def resolve_password_reset_user(*, user_model, uid: str, token: str, new_password: str):
    """Resolve the user for a password reset request and validate the new password."""
    try:
        user_id = force_str(urlsafe_base64_decode(uid))
        user = repositories.get_user_by_id(user_model=user_model, user_id=user_id)
    except (TypeError, ValueError, OverflowError, user_model.DoesNotExist) as exc:
        raise ValueError("Invalid reset link.") from exc

    if not default_token_generator.check_token(user, token):
        raise ValueError("Token is invalid or has expired.")

    try:
        validate_password(new_password, user)
    except DjangoValidationError:
        raise

    return user


def get_current_user_with_video_count(*, user_model, user_id: int):
    """Return the current user annotated with their video count."""
    return repositories.get_user_with_video_count(user_model=user_model, user_id=user_id)


def get_active_api_keys(*, user):
    """Return active API keys for the given user."""
    return repositories.get_active_api_keys(user=user)


def revoke_active_api_key(*, user, api_key_id: int):
    """Revoke an active API key owned by the given user."""
    api_key = repositories.get_active_api_key(user=user, api_key_id=api_key_id)
    api_key.revoke()
    return api_key
