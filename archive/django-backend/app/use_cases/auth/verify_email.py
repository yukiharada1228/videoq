"""
Use case: Verify email address using uid/token from the verification link.
"""

from app.domain.auth.gateways import UserManagementGateway
from app.domain.auth.services import (
    InvalidUidTokenLink as _DomainInvalidUidTokenLink,
)
from app.domain.auth.services import UidTokenLinkPolicy


class InvalidVerificationLink(Exception):
    pass


class VerifyEmailUseCase:
    def __init__(self, user_gateway: UserManagementGateway):
        self.user_gateway = user_gateway

    def execute(self, uidb64: str, token: str) -> None:
        policy = UidTokenLinkPolicy(
            invalid_message="Invalid or expired verification link.",
        )
        try:
            user_id = policy.require_user_id(
                user_id=self.user_gateway.get_user_id_by_uid_token(uidb64, token),
            )
        except _DomainInvalidUidTokenLink as exc:
            raise InvalidVerificationLink(str(exc)) from exc
        self.user_gateway.activate_user(user_id)
