"""Unit tests for LoginUseCase."""

from unittest import TestCase

from app.domain.auth.dtos import TokenPairDto
from app.domain.auth.ports import TokenGateway, UserAuthGateway
from app.use_cases.auth.exceptions import AuthenticationFailed
from app.use_cases.auth.login import LoginUseCase


class _StubUserAuthGateway(UserAuthGateway):
    def __init__(self, user_id):
        self._user_id = user_id

    def authenticate(self, username: str, password: str):
        return self._user_id


class _StubTokenGateway(TokenGateway):
    def issue_for_user(self, user_id: int) -> TokenPairDto:
        return TokenPairDto(access=f"access-{user_id}", refresh=f"refresh-{user_id}")

    def refresh(self, refresh_token: str) -> TokenPairDto:
        raise NotImplementedError


class LoginUseCaseTests(TestCase):
    def test_execute_returns_token_pair_when_credentials_valid(self):
        use_case = LoginUseCase(
            _StubUserAuthGateway(user_id=12),
            _StubTokenGateway(),
        )

        result = use_case.execute("user", "pass")

        self.assertEqual(result.access, "access-12")
        self.assertEqual(result.refresh, "refresh-12")

    def test_execute_raises_when_credentials_invalid(self):
        use_case = LoginUseCase(
            _StubUserAuthGateway(user_id=None),
            _StubTokenGateway(),
        )

        with self.assertRaises(AuthenticationFailed):
            use_case.execute("user", "wrong")
