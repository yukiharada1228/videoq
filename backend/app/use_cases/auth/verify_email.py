"""
Use case: Verify email address using uid/token from the verification link.
"""

from app.domain.auth.entities import (
    InvalidUidTokenLink as _DomainInvalidUidTokenLink,
    UidTokenLink,
)
from app.domain.auth.gateways import UserManagementGateway


class InvalidVerificationLink(Exception):
    pass


class VerifyEmailUseCase:
    def __init__(self, user_gateway: UserManagementGateway):
        self.user_gateway = user_gateway

    def execute(self, uidb64: str, token: str) -> None:
        link = UidTokenLink(
            uidb64=uidb64,
            token=token,
            invalid_message="Invalid or expired verification link.",
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
            raise InvalidVerificationLink(str(exc)) from exc
        self.user_gateway.activate_user(user_id)
