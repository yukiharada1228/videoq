"""
Use case: Register a new user and send email verification.
"""

import logging

from app.domain.auth.gateways import EmailSenderGateway, UserManagementGateway

logger = logging.getLogger(__name__)


class EmailAlreadyRegistered(Exception):
    pass


class SignupUserUseCase:
    def __init__(
        self,
        user_gateway: UserManagementGateway,
        email_sender: EmailSenderGateway,
    ):
        self.user_gateway = user_gateway
        self.email_sender = email_sender

    def execute(self, username: str, email: str, password: str) -> None:
        email = email.strip()
        if self.user_gateway.email_exists(email):
            raise EmailAlreadyRegistered("This email address is already registered.")

        user_id = self.user_gateway.create_inactive_user(username, email, password)

        try:
            self.email_sender.send_verification(user_id)
        except Exception:
            logger.exception("Failed to send verification email for user %s", user_id)
            raise
