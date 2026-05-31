"""Unit tests for email change use cases."""

from unittest import TestCase

from app.domain.auth.gateways import EmailSenderGateway, UserManagementGateway
from app.use_cases.auth.change_email import (
    EmailAlreadyRegistered,
    EmailChangeEmailSendFailed,
    ConfirmEmailChangeUseCase,
    InvalidEmailChangeLink,
    RequestEmailChangeUseCase,
)


class _StubUserGateway(UserManagementGateway):
    def __init__(self, *, email_exists=False, confirm_result=True):
        self._email_exists = email_exists
        self._confirm_result = confirm_result
        self.pending_email_for = None
        self.confirm_args = None

    def email_exists(self, email: str) -> bool:
        self.lookup_email = email
        return self._email_exists

    def create_inactive_user(self, username: str, email: str, password: str) -> int:
        raise NotImplementedError

    def activate_user(self, user_id: int) -> None:
        raise NotImplementedError

    def get_user_id_by_uid_token(self, uidb64: str, token: str):
        raise NotImplementedError

    def find_active_user_id_by_email(self, email: str):
        raise NotImplementedError

    def set_password(self, user_id: int, new_password: str) -> None:
        raise NotImplementedError

    def set_pending_email(self, user_id: int, email: str) -> None:
        self.pending_email_for = (user_id, email)

    def confirm_pending_email(self, uidb64: str, token: str) -> bool:
        self.confirm_args = (uidb64, token)
        return self._confirm_result


class _StubEmailSender(EmailSenderGateway):
    def __init__(self, *, should_fail=False):
        self.should_fail = should_fail
        self.email_change_sent_to = None

    def send_verification(self, user_id: int) -> None:
        raise NotImplementedError

    def send_password_reset(self, user_id: int) -> None:
        raise NotImplementedError

    def send_email_change_confirmation(self, user_id: int) -> None:
        if self.should_fail:
            raise RuntimeError("mail failed")
        self.email_change_sent_to = user_id


class RequestEmailChangeUseCaseTests(TestCase):
    def test_request_normalizes_sets_pending_email_and_sends_confirmation(self):
        user_gateway = _StubUserGateway(email_exists=False)
        email_sender = _StubEmailSender()
        use_case = RequestEmailChangeUseCase(user_gateway, email_sender)

        use_case.execute(user_id=7, new_email="  New@Example.COM  ")

        self.assertEqual(user_gateway.lookup_email, "new@example.com")
        self.assertEqual(user_gateway.pending_email_for, (7, "new@example.com"))
        self.assertEqual(email_sender.email_change_sent_to, 7)

    def test_request_rejects_registered_email_without_sending_confirmation(self):
        user_gateway = _StubUserGateway(email_exists=True)
        email_sender = _StubEmailSender()
        use_case = RequestEmailChangeUseCase(user_gateway, email_sender)

        with self.assertRaises(EmailAlreadyRegistered):
            use_case.execute(user_id=7, new_email="used@example.com")

        self.assertIsNone(user_gateway.pending_email_for)
        self.assertIsNone(email_sender.email_change_sent_to)

    def test_request_raises_when_confirmation_email_send_fails(self):
        user_gateway = _StubUserGateway(email_exists=False)
        email_sender = _StubEmailSender(should_fail=True)
        use_case = RequestEmailChangeUseCase(user_gateway, email_sender)

        with self.assertRaises(EmailChangeEmailSendFailed):
            use_case.execute(user_id=7, new_email="new@example.com")


class ConfirmEmailChangeUseCaseTests(TestCase):
    def test_confirm_delegates_to_gateway(self):
        user_gateway = _StubUserGateway(confirm_result=True)
        use_case = ConfirmEmailChangeUseCase(user_gateway)

        use_case.execute(uidb64="uid", token="token")

        self.assertEqual(user_gateway.confirm_args, ("uid", "token"))

    def test_confirm_raises_when_link_is_invalid(self):
        use_case = ConfirmEmailChangeUseCase(_StubUserGateway(confirm_result=False))

        with self.assertRaises(InvalidEmailChangeLink):
            use_case.execute(uidb64="uid", token="bad-token")
