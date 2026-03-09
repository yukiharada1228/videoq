"""Unit tests for RefreshTokenUseCase."""

from unittest import TestCase

from app.domain.auth.dtos import TokenPairDto
from app.domain.auth.ports import TokenGateway
from app.domain.shared.exceptions import TokenInvalidError
from app.use_cases.auth.exceptions import InvalidToken
from app.use_cases.auth.refresh_token import RefreshTokenUseCase


class _StubTokenGateway(TokenGateway):
    def __init__(self, should_raise_invalid: bool = False):
        self.should_raise_invalid = should_raise_invalid
        self.calls = []

    def issue_for_user(self, user_id: int) -> TokenPairDto:
        raise NotImplementedError

    def refresh(self, refresh_token: str) -> TokenPairDto:
        self.calls.append(refresh_token)
        if self.should_raise_invalid:
            raise TokenInvalidError("invalid token")
        return TokenPairDto(access="new-access", refresh="new-refresh")


class RefreshTokenUseCaseTests(TestCase):
    def test_execute_returns_token_pair_when_valid(self):
        gateway = _StubTokenGateway()
        use_case = RefreshTokenUseCase(gateway)

        result = use_case.execute("refresh-token")

        self.assertEqual(result.access, "new-access")
        self.assertEqual(result.refresh, "new-refresh")
        self.assertEqual(gateway.calls, ["refresh-token"])

    def test_execute_trims_token_before_gateway(self):
        gateway = _StubTokenGateway()
        use_case = RefreshTokenUseCase(gateway)

        use_case.execute("  refresh-token  ")

        self.assertEqual(gateway.calls, ["refresh-token"])

    def test_execute_raises_when_token_blank_without_calling_gateway(self):
        gateway = _StubTokenGateway()
        use_case = RefreshTokenUseCase(gateway)

        with self.assertRaises(InvalidToken):
            use_case.execute("   ")

        self.assertEqual(gateway.calls, [])

    def test_execute_maps_gateway_invalid_token_error(self):
        gateway = _StubTokenGateway(should_raise_invalid=True)
        use_case = RefreshTokenUseCase(gateway)

        with self.assertRaises(InvalidToken):
            use_case.execute("refresh-token")
