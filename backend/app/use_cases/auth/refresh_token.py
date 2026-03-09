"""
Use case: Refresh a JWT access token using a refresh token string.
"""

from app.domain.auth.entities import (
    InvalidRefreshTokenInput as _DomainInvalidRefreshTokenInput,
    RefreshSessionRequest,
)
from app.domain.auth.ports import TokenGateway
from app.domain.shared.exceptions import TokenInvalidError
from app.use_cases.auth.dto import TokenPairOutput
from app.use_cases.auth.exceptions import InvalidToken


class RefreshTokenUseCase:
    def __init__(self, token_gateway: TokenGateway):
        self.token_gateway = token_gateway

    def execute(self, refresh_token: str) -> TokenPairOutput:
        try:
            normalized_refresh_token = RefreshSessionRequest(
                refresh_token=refresh_token
            ).require_token()
            token_pair = self.token_gateway.refresh(normalized_refresh_token)
            return TokenPairOutput(access=token_pair.access, refresh=token_pair.refresh)
        except _DomainInvalidRefreshTokenInput as e:
            raise InvalidToken(str(e)) from e
        except TokenInvalidError as e:
            raise InvalidToken(str(e)) from e
