"""
Use case: Authenticate a user and issue a JWT token pair.
"""

from app.domain.auth.ports import TokenGateway, TokenPairDto, UserAuthGateway
from app.use_cases.auth.exceptions import AuthenticationFailed


class LoginUseCase:
    def __init__(self, user_auth_gateway: UserAuthGateway, token_gateway: TokenGateway):
        self.user_auth_gateway = user_auth_gateway
        self.token_gateway = token_gateway

    def execute(self, username: str, password: str) -> TokenPairDto:
        user_id = self.user_auth_gateway.authenticate(username, password)
        if user_id is None:
            raise AuthenticationFailed("Invalid credentials.")
        return self.token_gateway.issue_for_user(user_id)
