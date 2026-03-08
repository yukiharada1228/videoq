"""
Use case: Register a new user and send email verification.
"""

import logging

from app.domain.auth.gateways import EmailSenderGateway, UserManagementGateway
from app.domain.auth.services import (
    SignupPolicy,
    SignupEmailAlreadyRegistered as _DomainSignupEmailAlreadyRegistered,
)

logger = logging.getLogger(__name__)


class EmailAlreadyRegistered(Exception):
    pass


class VerificationEmailSendFailed(Exception):
    """Raised when sending verification email fails."""


class SignupUserUseCase:
    def __init__(
        self,
        user_gateway: UserManagementGateway,
        email_sender: EmailSenderGateway,
    ):
        self.user_gateway = user_gateway
        self.email_sender = email_sender

    def execute(self, username: str, email: str, password: str) -> None:
        policy = SignupPolicy(email=email)
        normalized_email = policy.normalized_email()
        try:
            policy.assert_email_available(
                email_exists=self.user_gateway.email_exists(normalized_email)
            )
        except _DomainSignupEmailAlreadyRegistered as exc:
            raise EmailAlreadyRegistered(str(exc)) from exc

        user_id = self.user_gateway.create_inactive_user(
            username, normalized_email, password
        )

        try:
            self.email_sender.send_verification(user_id)
        except Exception as exc:
            logger.exception("Failed to send verification email for user %s", user_id)
            raise VerificationEmailSendFailed(
                "Failed to send verification email."
            ) from exc
