"""
Use case: Authenticate a user and issue a JWT token pair.
"""

from app.domain.auth.entities import (
    InvalidCredentials as _DomainInvalidCredentials,
    LoginAttempt,
)
from app.domain.auth.ports import TokenGateway, UserAuthGateway
from app.use_cases.auth.dto import TokenPairOutput
from app.use_cases.auth.exceptions import AuthenticationFailed


class LoginUseCase:
    def __init__(self, user_auth_gateway: UserAuthGateway, token_gateway: TokenGateway):
        self.user_auth_gateway = user_auth_gateway
        self.token_gateway = token_gateway

    def execute(self, username: str, password: str) -> TokenPairOutput:
        try:
            login_attempt = LoginAttempt(
                username=username,
                password=password,
            )
            normalized_username = login_attempt.require_valid_input()
            user_id = login_attempt.require_authenticated_user_id(
                user_id=self.user_auth_gateway.authenticate(normalized_username, password)
            )
        except _DomainInvalidCredentials as exc:
            raise AuthenticationFailed(str(exc)) from exc
        token_pair = self.token_gateway.issue_for_user(user_id)
        return TokenPairOutput(access=token_pair.access, refresh=token_pair.refresh)
