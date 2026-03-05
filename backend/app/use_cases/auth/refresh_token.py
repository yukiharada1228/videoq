"""
Use case: Refresh a JWT access token using a refresh token string.
"""

from app.domain.auth.ports import TokenGateway, TokenPairDto


class RefreshTokenUseCase:
    def __init__(self, token_gateway: TokenGateway):
        self.token_gateway = token_gateway

    def execute(self, refresh_token: str) -> TokenPairDto:
        # InvalidToken is raised by the gateway and propagates to the caller.
        return self.token_gateway.refresh(refresh_token)
