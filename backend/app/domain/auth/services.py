"""Backward-compatible auth domain service wrappers.

Business rules now live in domain entities:
- SignupRequest
- LoginAttempt
- RefreshSessionRequest
- UidTokenLink
- PasswordResetRequest
"""

from dataclasses import dataclass

from app.domain.auth.entities import (
    InvalidCredentials,
    InvalidRefreshTokenInput,
    InvalidSignupInput,
    InvalidUidTokenLink,
    LoginAttempt,
    PasswordResetRequest,
    RefreshSessionRequest,
    SignupEmailAlreadyRegistered,
    SignupRequest,
    UidTokenLink,
)


def normalize_signup_email(email: str) -> str:
    return SignupRequest(username="x", email=email, password="x").normalized()[1]


def assert_signup_email_available(*, email_exists: bool) -> None:
    SignupRequest(username="x", email="x@example.com", password="x").assert_email_available(
        email_exists=email_exists
    )


@dataclass(frozen=True)
class SignupPolicy:
    """Compatibility policy wrapper delegating to SignupRequest."""

    email: str

    def normalized_email(self) -> str:
        return SignupRequest(username="x", email=self.email, password="x").normalized()[1]

    @staticmethod
    def normalize_username(username: str) -> str:
        return LoginAttempt(username=username, password="x").normalized_username()

    @staticmethod
    def require_password(password: str) -> str:
        if not password:
            raise InvalidSignupInput()
        return password

    def require_valid_input(self, *, username: str, password: str) -> tuple[str, str, str]:
        return SignupRequest(
            username=username,
            email=self.email,
            password=password,
        ).normalized()

    def assert_email_available(self, *, email_exists: bool) -> None:
        SignupRequest(
            username="x",
            email=self.email,
            password="x",
        ).assert_email_available(email_exists=email_exists)


@dataclass(frozen=True)
class PasswordResetRequestPolicy:
    """Compatibility policy wrapper delegating to PasswordResetRequest."""

    email: str

    def normalized_email(self) -> str:
        return PasswordResetRequest(email=self.email).normalized_email()

    @staticmethod
    def should_send(*, user_id: int | None) -> bool:
        return PasswordResetRequest.should_send(user_id=user_id)


@dataclass(frozen=True)
class UidTokenLinkPolicy:
    """Compatibility policy wrapper delegating to UidTokenLink."""

    invalid_message: str

    def require_user_id(self, *, user_id: int | None) -> int:
        return UidTokenLink(
            uidb64="uid",
            token="token",
            invalid_message=self.invalid_message,
        ).require_resolved_user_id(user_id=user_id)

    def require_uid_token_input(self, *, uidb64: str, token: str) -> tuple[str, str]:
        return UidTokenLink(
            uidb64=uidb64,
            token=token,
            invalid_message=self.invalid_message,
        ).normalized_components()


@dataclass(frozen=True)
class LoginCredentialsPolicy:
    """Compatibility policy wrapper delegating to LoginAttempt."""

    username: str
    password: str

    def normalized_username(self) -> str:
        return LoginAttempt(username=self.username, password=self.password).normalized_username()

    def require_valid_input(self) -> None:
        LoginAttempt(username=self.username, password=self.password).require_valid_input()


@dataclass(frozen=True)
class RefreshTokenPolicy:
    """Compatibility policy wrapper delegating to RefreshSessionRequest."""

    refresh_token: str

    def normalized_refresh_token(self) -> str:
        return RefreshSessionRequest(refresh_token=self.refresh_token).normalized_refresh_token()

    def require_token(self) -> str:
        return RefreshSessionRequest(refresh_token=self.refresh_token).require_token()


def normalize_password_reset_email(email: str) -> str:
    return PasswordResetRequestPolicy(email=email).normalized_email()


def should_send_password_reset(*, user_id: int | None) -> bool:
    return PasswordResetRequestPolicy(email="").should_send(user_id=user_id)


def require_user_id_from_uid_token(*, user_id: int | None, message: str) -> int:
    return UidTokenLinkPolicy(invalid_message=message).require_user_id(user_id=user_id)


def require_authenticated_user_id(*, user_id: int | None) -> int:
    return LoginAttempt.require_authenticated_user_id(user_id=user_id)


def normalize_login_username(username: str) -> str:
    return LoginCredentialsPolicy(username=username, password="x").normalized_username()


def require_valid_login_input(*, username: str, password: str) -> str:
    return LoginAttempt(username=username, password=password).require_valid_input()


def require_refresh_token_input(*, refresh_token: str) -> str:
    return RefreshTokenPolicy(refresh_token=refresh_token).require_token()


def require_signup_input(
    *,
    username: str,
    email: str,
    password: str,
) -> tuple[str, str, str]:
    return SignupRequest(
        username=username,
        email=email,
        password=password,
    ).normalized()


def require_uid_token_input(
    *,
    uidb64: str,
    token: str,
    message: str,
) -> tuple[str, str]:
    return UidTokenLink(
        uidb64=uidb64,
        token=token,
        invalid_message=message,
    ).normalized_components()
