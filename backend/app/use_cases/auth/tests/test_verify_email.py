"""Unit tests for VerifyEmailUseCase."""

from unittest import TestCase

from app.domain.auth.gateways import UserManagementGateway
from app.use_cases.auth.verify_email import InvalidVerificationLink, VerifyEmailUseCase


class _StubUserGateway(UserManagementGateway):
    def __init__(self, uid_token_user_id=None):
        self._uid_token_user_id = uid_token_user_id
        self.activated_user_id = None
        self.uid_token_lookup_args = None

    def email_exists(self, email: str) -> bool:
        raise NotImplementedError

    def create_inactive_user(self, username: str, email: str, password: str) -> int:
        raise NotImplementedError

    def activate_user(self, user_id: int) -> None:
        self.activated_user_id = user_id

    def get_user_id_by_uid_token(self, uidb64: str, token: str):
        self.uid_token_lookup_args = (uidb64, token)
        return self._uid_token_user_id

    def find_active_user_id_by_email(self, email: str):
        raise NotImplementedError

    def set_password(self, user_id: int, new_password: str) -> None:
        raise NotImplementedError


class VerifyEmailUseCaseTests(TestCase):
    def test_execute_raises_when_uid_token_invalid(self):
        use_case = VerifyEmailUseCase(_StubUserGateway(uid_token_user_id=None))

        with self.assertRaises(InvalidVerificationLink):
            use_case.execute("uid", "token")

    def test_execute_activates_user_when_uid_token_valid(self):
        user_gateway = _StubUserGateway(uid_token_user_id=3)
        use_case = VerifyEmailUseCase(user_gateway)

        use_case.execute("uid", "token")

        self.assertEqual(user_gateway.activated_user_id, 3)

    def test_execute_normalizes_uid_token_before_lookup(self):
        user_gateway = _StubUserGateway(uid_token_user_id=3)
        use_case = VerifyEmailUseCase(user_gateway)

        use_case.execute("  uid  ", "  token  ")

        self.assertEqual(user_gateway.uid_token_lookup_args, ("uid", "token"))

    def test_execute_raises_when_uid_token_input_blank(self):
        user_gateway = _StubUserGateway(uid_token_user_id=3)
        use_case = VerifyEmailUseCase(user_gateway)

        with self.assertRaises(InvalidVerificationLink):
            use_case.execute(" ", "token")

        self.assertIsNone(user_gateway.uid_token_lookup_args)
