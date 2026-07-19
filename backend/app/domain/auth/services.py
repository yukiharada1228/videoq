"""Domain policies for signup and auth workflows."""

from dataclasses import dataclass


class SignupEmailAlreadyRegistered(Exception):
    """Raised when signup is attempted with an already-registered email."""


class InvalidUidTokenLink(Exception):
    """Raised when uid/token cannot be resolved to an active user."""


class InvalidCredentials(Exception):
    """Raised when authentication credentials are invalid."""


@dataclass(frozen=True)
class SignupPolicy:
    """Domain policy for signup email normalization/availability checks."""

    email: str

    def normalized_email(self) -> str:
        return self.email.strip().lower()

    def assert_email_available(self, *, email_exists: bool) -> None:
        if email_exists:
            raise SignupEmailAlreadyRegistered(
                "This email address is already registered."
            )


@dataclass(frozen=True)
class PasswordResetRequestPolicy:
    """Domain policy for password reset request behavior."""

    email: str

    def normalized_email(self) -> str:
        return self.email.strip()

    @staticmethod
    def should_send(*, user_id: int | None) -> bool:
        return user_id is not None


@dataclass(frozen=True)
class UidTokenLinkPolicy:
    """Domain policy for uid/token link resolution."""

    invalid_message: str

    def require_user_id(self, *, user_id: int | None) -> int:
        if user_id is None:
            raise InvalidUidTokenLink(self.invalid_message)
        return user_id


def require_authenticated_user_id(*, user_id: int | None) -> int:
    if user_id is None:
        raise InvalidCredentials("Invalid credentials.")
    return user_id
