"""
Use cases: Request and confirm password reset.
"""

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
        user_id = self.user_gateway.find_active_user_id_by_email(email)
        if user_id is None:
            return  # Silent — don't reveal whether email is registered
        self.email_sender.send_password_reset(user_id)


class ConfirmPasswordResetUseCase:
    def __init__(self, user_gateway: UserManagementGateway):
        self.user_gateway = user_gateway

    def execute(self, uidb64: str, token: str, new_password: str) -> None:
        user_id = self.user_gateway.get_user_id_by_uid_token(uidb64, token)
        if user_id is None:
            raise InvalidResetLink("Invalid or expired reset link.")
        self.user_gateway.set_password(user_id, new_password)
