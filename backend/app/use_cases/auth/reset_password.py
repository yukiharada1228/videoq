"""
Use cases: Request and confirm password reset.
"""

from app.domain.auth.entities import (
    InvalidUidTokenLink as _DomainInvalidUidTokenLink,
    PasswordResetRequest,
    UidTokenLink,
)
from app.domain.auth.gateways import EmailSenderGateway, UserManagementGateway


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
        request = PasswordResetRequest(email=email)
        normalized_email = request.normalized_email()
        user_id = self.user_gateway.find_active_user_id_by_email(normalized_email)
        if not request.should_send(user_id=user_id) or user_id is None:
            return  # Silent — don't reveal whether email is registered
        self.email_sender.send_password_reset(user_id)


class ConfirmPasswordResetUseCase:
    def __init__(self, user_gateway: UserManagementGateway):
        self.user_gateway = user_gateway

    def execute(self, uidb64: str, token: str, new_password: str) -> None:
        link = UidTokenLink(
            uidb64=uidb64,
            token=token,
            invalid_message="Invalid or expired reset link.",
        )
        try:
            normalized_uidb64, normalized_token = link.normalized_components()
            user_id = link.require_resolved_user_id(
                user_id=self.user_gateway.get_user_id_by_uid_token(
                    normalized_uidb64,
                    normalized_token,
                ),
            )
        except _DomainInvalidUidTokenLink as exc:
            raise InvalidResetLink(str(exc)) from exc
        self.user_gateway.set_password(user_id, new_password)
