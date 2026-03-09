"""
Domain entities for the auth domain.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from app.domain.auth.scopes import READ_ONLY_ALLOWED_SCOPES
from app.domain.auth.value_objects import (
    EmailAddress,
    RefreshTokenValue,
    UidTokenComponent,
    Username,
)

ACCESS_LEVEL_ALL = "all"
ACCESS_LEVEL_READ_ONLY = "read_only"
VALID_ACCESS_LEVELS = {ACCESS_LEVEL_ALL, ACCESS_LEVEL_READ_ONLY}


class DuplicateApiKeyName(ValueError):
    """Raised when trying to create an API key with an already-used active name."""

    def __init__(self, name: str):
        super().__init__(f"An active API key with this name already exists: {name}")


class InvalidApiKeyAccessLevel(ValueError):
    """Raised when an API key access level is not supported by domain policy."""

    def __init__(self, access_level: str):
        super().__init__(f"Unsupported API key access level: {access_level}")


class InvalidApiKeyName(ValueError):
    """Raised when API key name is missing after normalization."""

    def __init__(self):
        super().__init__("API key name is required")


class InvalidCredentials(ValueError):
    """Raised when authentication credentials are invalid."""

    def __init__(self):
        super().__init__("Invalid credentials.")


class InvalidRefreshTokenInput(ValueError):
    """Raised when refresh-token input is missing or blank."""

    def __init__(self):
        super().__init__("Refresh token is required.")


class InvalidSignupInput(ValueError):
    """Raised when signup input is missing or blank."""

    def __init__(self):
        super().__init__("Username, email, and password are required.")


class SignupEmailAlreadyRegistered(ValueError):
    """Raised when signup is attempted with an already-registered email."""

    def __init__(self):
        super().__init__("This email address is already registered.")


class InvalidUidTokenLink(ValueError):
    """Raised when uid/token cannot be resolved to an active user."""

    def __init__(self, message: str):
        super().__init__(message)


@dataclass(frozen=True)
class SignupRequest:
    """Signup aggregate root for signup input and registration invariants."""

    username: str
    email: str
    password: str

    def normalized(self) -> tuple[str, str, str]:
        try:
            normalized_username = Username.from_raw(
                self.username,
                require_non_blank=True,
            ).value
            normalized_email = EmailAddress.from_raw(
                self.email,
                require_non_blank=True,
            ).value
        except ValueError as exc:
            raise InvalidSignupInput() from exc
        if not self.password:
            raise InvalidSignupInput()
        return normalized_username, normalized_email, self.password

    def assert_email_available(self, *, email_exists: bool) -> None:
        if email_exists:
            raise SignupEmailAlreadyRegistered()


@dataclass(frozen=True)
class PasswordResetRequest:
    """Password reset request model with privacy-preserving send policy."""

    email: str

    def normalized_email(self) -> str:
        return EmailAddress.from_raw(self.email).value

    @staticmethod
    def should_send(*, user_id: int | None) -> bool:
        return user_id is not None


@dataclass(frozen=True)
class UidTokenLink:
    """Verification/reset link model for uid/token normalization and resolution."""

    uidb64: str
    token: str
    invalid_message: str

    def normalized_components(self) -> tuple[str, str]:
        try:
            normalized_uidb64 = UidTokenComponent.from_raw(
                self.uidb64,
                require_non_blank=True,
            ).value
            normalized_token = UidTokenComponent.from_raw(
                self.token,
                require_non_blank=True,
            ).value
        except ValueError as exc:
            raise InvalidUidTokenLink(self.invalid_message) from exc
        return normalized_uidb64, normalized_token

    def require_resolved_user_id(self, *, user_id: int | None) -> int:
        if user_id is None:
            raise InvalidUidTokenLink(self.invalid_message)
        return user_id


@dataclass(frozen=True)
class LoginAttempt:
    """Login command model for credential validation and auth result handling."""

    username: str
    password: str

    def normalized_username(self) -> str:
        return Username.from_raw(self.username).value

    def require_valid_input(self) -> str:
        try:
            normalized_username = Username.from_raw(
                self.username,
                require_non_blank=True,
            ).value
        except ValueError as exc:
            raise InvalidCredentials() from exc
        if not normalized_username or not self.password:
            raise InvalidCredentials()
        return normalized_username

    @staticmethod
    def require_authenticated_user_id(*, user_id: int | None) -> int:
        if user_id is None:
            raise InvalidCredentials()
        return user_id


@dataclass(frozen=True)
class RefreshSessionRequest:
    """Refresh session command model for refresh-token validation."""

    refresh_token: str

    def normalized_refresh_token(self) -> str:
        return RefreshTokenValue.from_raw(self.refresh_token).value

    def require_token(self) -> str:
        try:
            return RefreshTokenValue.from_raw(
                self.refresh_token,
                require_non_blank=True,
            ).value
        except ValueError as exc:
            raise InvalidRefreshTokenInput() from exc


@dataclass
class ApiKeyEntity:
    id: int
    name: str
    prefix: str
    access_level: str
    last_used_at: Optional[datetime]
    created_at: datetime
    revoked_at: Optional[datetime] = None

    def allows_scope(self, required_scope: str) -> bool:
        return is_scope_allowed_for_access_level(self.access_level, required_scope)


@dataclass
class ApiKeyCreateResult:
    api_key: ApiKeyEntity
    raw_key: str


def is_scope_allowed_for_access_level(access_level: str, required_scope: str) -> bool:
    if access_level == ACCESS_LEVEL_ALL:
        return True
    if access_level == ACCESS_LEVEL_READ_ONLY:
        return required_scope in READ_ONLY_ALLOWED_SCOPES
    return False


def assert_api_key_name_available(*, name: str, exists_active_with_name: bool) -> None:
    if exists_active_with_name:
        raise DuplicateApiKeyName(name)


def assert_valid_api_key_access_level(access_level: str) -> None:
    if access_level not in VALID_ACCESS_LEVELS:
        raise InvalidApiKeyAccessLevel(access_level)


def normalize_api_key_name(name: str) -> str:
    normalized = name.strip()
    if not normalized:
        raise InvalidApiKeyName()
    return normalized
