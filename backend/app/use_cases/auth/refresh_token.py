"""
Use case: Refresh a JWT access token using a refresh token string.
"""

from app.domain.auth.ports import TokenGateway, TokenPairDto
from app.domain.shared.exceptions import TokenInvalidError
from app.use_cases.auth.exceptions import InvalidToken


class RefreshTokenUseCase:
    def __init__(self, token_gateway: TokenGateway):
        self.token_gateway = token_gateway

    def execute(self, refresh_token: str) -> TokenPairDto:
        try:
            return self.token_gateway.refresh(refresh_token)
        except TokenInvalidError as e:
            raise InvalidToken(str(e)) from e
