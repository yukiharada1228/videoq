"""Use cases: request and confirm an email address change."""

import logging

from app.domain.auth.gateways import EmailSenderGateway, UserManagementGateway

logger = logging.getLogger(__name__)


class EmailAlreadyRegistered(Exception):
    """Raised when the requested email address is already registered."""


class EmailChangeEmailSendFailed(Exception):
    """Raised when sending the email-change confirmation email fails."""


class InvalidEmailChangeLink(Exception):
    """Raised when an email-change confirmation link is invalid or expired."""


class RequestEmailChangeUseCase:
    def __init__(
        self,
        user_gateway: UserManagementGateway,
        email_sender: EmailSenderGateway,
    ):
        self.user_gateway = user_gateway
        self.email_sender = email_sender

    def execute(self, user_id: int, new_email: str) -> None:
        normalized_email = new_email.strip().lower()
        if self.user_gateway.email_exists(normalized_email):
            raise EmailAlreadyRegistered("This email address is already registered.")

        self.user_gateway.set_pending_email(user_id, normalized_email)
        try:
            self.email_sender.send_email_change_confirmation(user_id)
        except Exception as exc:
            logger.exception(
                "Failed to send email-change confirmation for user %s",
                user_id,
            )
            raise EmailChangeEmailSendFailed(
                "Failed to send email-change confirmation email."
            ) from exc


class ConfirmEmailChangeUseCase:
    def __init__(self, user_gateway: UserManagementGateway):
        self.user_gateway = user_gateway

    def execute(self, uidb64: str, token: str) -> None:
        if not self.user_gateway.confirm_pending_email(uidb64, token):
            raise InvalidEmailChangeLink("Invalid or expired email change link.")
