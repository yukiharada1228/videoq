"""
Use cases: Request and confirm password reset.
"""

from app.domain.auth.gateways import EmailSenderGateway, UserManagementGateway
from app.domain.auth.services import (
    InvalidUidTokenLink as _DomainInvalidUidTokenLink,
)
from app.domain.auth.services import (
    PasswordResetRequestPolicy,
    UidTokenLinkPolicy,
)


class InvalidResetLink(Exception):
    pass


class RequestPasswordResetUseCase:
    def __init__(
        self,
        user_gateway: UserManagementGateway,
        email_sender: EmailSenderGateway,
    ):
        self.user_gateway = user_gateway
        self.email_sender = email_sender

    def execute(self, email: str) -> None:
        policy = PasswordResetRequestPolicy(email=email)
        normalized_email = policy.normalized_email()
        user_id = self.user_gateway.find_active_user_id_by_email(normalized_email)
        if not policy.should_send(user_id=user_id):
            return  # Silent — don't reveal whether email is registered
        self.email_sender.send_password_reset(user_id)


class ConfirmPasswordResetUseCase:
    def __init__(self, user_gateway: UserManagementGateway):
        self.user_gateway = user_gateway

    def execute(self, uidb64: str, token: str, new_password: str) -> None:
        policy = UidTokenLinkPolicy(
            invalid_message="Invalid or expired reset link.",
        )
        try:
            user_id = policy.require_user_id(
                user_id=self.user_gateway.get_user_id_by_uid_token(uidb64, token),
            )
        except _DomainInvalidUidTokenLink as exc:
            raise InvalidResetLink(str(exc)) from exc
        self.user_gateway.set_password(user_id, new_password)
