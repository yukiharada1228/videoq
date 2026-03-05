"""
Use case: Verify email address using uid/token from the verification link.
"""

from app.domain.auth.gateways import UserManagementGateway


class InvalidVerificationLink(Exception):
    pass


class VerifyEmailUseCase:
    def __init__(self, user_gateway: UserManagementGateway):
        self.user_gateway = user_gateway

    def execute(self, uidb64: str, token: str) -> None:
        user_id = self.user_gateway.get_user_id_by_uid_token(uidb64, token)
        if user_id is None:
            raise InvalidVerificationLink("Invalid or expired verification link.")
        self.user_gateway.activate_user(user_id)
