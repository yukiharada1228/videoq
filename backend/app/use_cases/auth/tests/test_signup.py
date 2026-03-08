"""Unit tests for SignupUserUseCase."""

from unittest import TestCase

from app.domain.auth.gateways import EmailSenderGateway, UserManagementGateway
from app.use_cases.auth.signup import (
    EmailAlreadyRegistered,
    SignupUserUseCase,
    VerificationEmailSendFailed,
)


class _StubUserManagementGateway(UserManagementGateway):
    def __init__(self, email_exists: bool = False, user_id: int = 1):
        self._email_exists = email_exists
        self._user_id = user_id
        self.created_args = None

    def email_exists(self, email: str) -> bool:
        return self._email_exists

    def create_inactive_user(self, username: str, email: str, password: str) -> int:
        self.created_args = (username, email, password)
        return self._user_id

    def activate_user(self, user_id: int) -> None:
        raise NotImplementedError

    def get_user_id_by_uid_token(self, uidb64: str, token: str):
        raise NotImplementedError

    def find_active_user_id_by_email(self, email: str):
        raise NotImplementedError

    def set_password(self, user_id: int, new_password: str) -> None:
        raise NotImplementedError


class _StubEmailSenderGateway(EmailSenderGateway):
    def __init__(self, should_fail: bool = False):
        self._should_fail = should_fail
        self.sent_user_id = None

    def send_verification(self, user_id: int) -> None:
        if self._should_fail:
            raise RuntimeError("mail failed")
        self.sent_user_id = user_id

    def send_password_reset(self, user_id: int) -> None:
        raise NotImplementedError


class SignupUserUseCaseTests(TestCase):
    def test_execute_normalizes_email_before_create(self):
        user_gateway = _StubUserManagementGateway(email_exists=False, user_id=10)
        email_sender = _StubEmailSenderGateway()
        use_case = SignupUserUseCase(user_gateway, email_sender)

        use_case.execute("alice", "  alice@example.com  ", "password")

        self.assertEqual(
            user_gateway.created_args,
            ("alice", "alice@example.com", "password"),
        )
        self.assertEqual(email_sender.sent_user_id, 10)

    def test_execute_raises_when_email_already_registered(self):
        use_case = SignupUserUseCase(
            _StubUserManagementGateway(email_exists=True),
            _StubEmailSenderGateway(),
        )

        with self.assertRaises(EmailAlreadyRegistered):
            use_case.execute("alice", "alice@example.com", "password")

    def test_execute_raises_when_email_send_fails(self):
        use_case = SignupUserUseCase(
            _StubUserManagementGateway(email_exists=False, user_id=7),
            _StubEmailSenderGateway(should_fail=True),
        )

        with self.assertRaises(VerificationEmailSendFailed):
            use_case.execute("alice", "alice@example.com", "password")
