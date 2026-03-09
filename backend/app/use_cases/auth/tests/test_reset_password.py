"""Unit tests for password reset use cases."""

from unittest import TestCase

from app.domain.auth.gateways import EmailSenderGateway, UserManagementGateway
from app.use_cases.auth.reset_password import (
    ConfirmPasswordResetUseCase,
    InvalidResetLink,
    RequestPasswordResetUseCase,
)


class _StubUserGateway(UserManagementGateway):
    def __init__(self, active_user_id_by_email=None, uid_token_user_id=None):
        self._active_user_id_by_email = active_user_id_by_email
        self._uid_token_user_id = uid_token_user_id
        self.password_reset_for = None
        self.uid_token_lookup_args = None

    def email_exists(self, email: str) -> bool:
        raise NotImplementedError

    def create_inactive_user(self, username: str, email: str, password: str) -> int:
        raise NotImplementedError

    def activate_user(self, user_id: int) -> None:
        raise NotImplementedError

    def get_user_id_by_uid_token(self, uidb64: str, token: str):
        self.uid_token_lookup_args = (uidb64, token)
        return self._uid_token_user_id

    def find_active_user_id_by_email(self, email: str):
        self.lookup_email = email
        return self._active_user_id_by_email

    def set_password(self, user_id: int, new_password: str) -> None:
        self.password_reset_for = (user_id, new_password)


class _StubEmailSender(EmailSenderGateway):
    def __init__(self):
        self.sent_to_user_id = None

    def send_verification(self, user_id: int) -> None:
        raise NotImplementedError

    def send_password_reset(self, user_id: int) -> None:
        self.sent_to_user_id = user_id


class PasswordResetUseCaseTests(TestCase):
    def test_request_reset_is_silent_when_email_not_found(self):
        user_gateway = _StubUserGateway(active_user_id_by_email=None)
        email_sender = _StubEmailSender()
        use_case = RequestPasswordResetUseCase(user_gateway, email_sender)

        use_case.execute("missing@example.com")

        self.assertIsNone(email_sender.sent_to_user_id)

    def test_request_reset_normalizes_email_before_lookup(self):
        user_gateway = _StubUserGateway(active_user_id_by_email=4)
        email_sender = _StubEmailSender()
        use_case = RequestPasswordResetUseCase(user_gateway, email_sender)

        use_case.execute("  user@example.com  ")

        self.assertEqual(user_gateway.lookup_email, "user@example.com")
        self.assertEqual(email_sender.sent_to_user_id, 4)

    def test_confirm_reset_raises_when_uid_token_invalid(self):
        use_case = ConfirmPasswordResetUseCase(
            _StubUserGateway(uid_token_user_id=None),
        )

        with self.assertRaises(InvalidResetLink):
            use_case.execute("uid", "token", "newpass123")

    def test_confirm_reset_sets_password_when_uid_token_valid(self):
        user_gateway = _StubUserGateway(uid_token_user_id=5)
        use_case = ConfirmPasswordResetUseCase(user_gateway)

        use_case.execute("uid", "token", "newpass123")

        self.assertEqual(user_gateway.password_reset_for, (5, "newpass123"))

    def test_confirm_reset_normalizes_uid_token_before_lookup(self):
        user_gateway = _StubUserGateway(uid_token_user_id=5)
        use_case = ConfirmPasswordResetUseCase(user_gateway)

        use_case.execute("  uid  ", "  token  ", "newpass123")

        self.assertEqual(user_gateway.uid_token_lookup_args, ("uid", "token"))

    def test_confirm_reset_raises_when_uid_token_input_blank(self):
        user_gateway = _StubUserGateway(uid_token_user_id=5)
        use_case = ConfirmPasswordResetUseCase(user_gateway)

        with self.assertRaises(InvalidResetLink):
            use_case.execute("   ", "token", "newpass123")

        self.assertIsNone(user_gateway.uid_token_lookup_args)
