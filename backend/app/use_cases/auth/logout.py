"""Use case: Invalidate a refresh token during logout."""

from app.domain.auth.ports import TokenGateway


class LogoutUseCase:
    def __init__(self, token_gateway: TokenGateway):
        self.token_gateway = token_gateway

    def execute(self, refresh_token: str) -> None:
        self.token_gateway.invalidate_refresh_token(refresh_token)
