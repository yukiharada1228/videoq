"""Tests for auth context resolver use cases."""

import unittest

from app.domain.auth.dtos import ApiKeyAuthContextDTO, ShareAuthContextDTO
from app.use_cases.auth.resolve_api_key import ResolveApiKeyUseCase
from app.use_cases.auth.resolve_share_token import ResolveShareTokenUseCase


class _StubShareTokenResolver:
    def __init__(self, resolved):
        self._resolved = resolved

    def resolve(self, token: str):
        return self._resolved


class _StubApiKeyResolver:
    def __init__(self, resolved):
        self._resolved = resolved

    def resolve(self, api_key: str):
        return self._resolved


class ResolveShareTokenUseCaseTests(unittest.TestCase):
    def test_execute_returns_use_case_output_dto(self):
        use_case = ResolveShareTokenUseCase(
            _StubShareTokenResolver(
                ShareAuthContextDTO(share_slug="share_123", group_id=9)
            )
        )

        result = use_case.execute("share_123")

        self.assertIsNotNone(result)
        self.assertEqual(result.share_slug, "share_123")
        self.assertEqual(result.group_id, 9)

    def test_execute_returns_none_when_unresolved(self):
        use_case = ResolveShareTokenUseCase(_StubShareTokenResolver(None))

        result = use_case.execute("missing")

        self.assertIsNone(result)


class ResolveApiKeyUseCaseTests(unittest.TestCase):
    def test_execute_returns_use_case_output_dto(self):
        use_case = ResolveApiKeyUseCase(
            _StubApiKeyResolver(
                ApiKeyAuthContextDTO(
                    api_key_id=15,
                    user_id=3,
                    access_level="all",
                )
            )
        )

        result = use_case.execute("vq_secret")

        self.assertIsNotNone(result)
        self.assertEqual(result.api_key_id, 15)
        self.assertEqual(result.user_id, 3)
        self.assertEqual(result.access_level, "all")

    def test_execute_returns_none_when_unresolved(self):
        use_case = ResolveApiKeyUseCase(_StubApiKeyResolver(None))

        result = use_case.execute("invalid")

        self.assertIsNone(result)
