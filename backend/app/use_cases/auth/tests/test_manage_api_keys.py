"""Tests for API key management use cases."""

from datetime import datetime, timezone
import unittest

from app.domain.auth.entities import (
    ApiKeyCreateResult,
    ApiKeyEntity,
    DuplicateApiKeyName,
    InvalidApiKeyAccessLevel,
    InvalidApiKeyName,
)
from app.domain.auth.repositories import ApiKeyRepository
from app.use_cases.auth.manage_api_keys import CreateApiKeyUseCase, ListApiKeysUseCase


class _StubApiKeyRepository(ApiKeyRepository):
    def __init__(self):
        self.entities = []
        self.exists = False
        self.created_name = None

    def list_for_user(self, user_id: int):
        return self.entities

    def create_for_user(self, user_id: int, name: str, access_level: str):
        self.created_name = name
        entity = ApiKeyEntity(
            id=1,
            name=name,
            prefix="vq_abc123",
            access_level=access_level,
            last_used_at=None,
            created_at=datetime.now(timezone.utc),
        )
        return ApiKeyCreateResult(api_key=entity, raw_key="vq_rawkey")

    def get_active_by_id(self, key_id: int, user_id: int):
        return None

    def revoke(self, key_id: int, user_id: int):
        return False

    def exists_active_with_name(self, user_id: int, name: str):
        return self.exists


class ManageApiKeysUseCaseTests(unittest.TestCase):
    def test_list_use_case_returns_output_dto(self):
        repo = _StubApiKeyRepository()
        repo.entities = [
            ApiKeyEntity(
                id=11,
                name="integration",
                prefix="vq_11",
                access_level="all",
                last_used_at=None,
                created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            )
        ]
        use_case = ListApiKeysUseCase(repo)

        result = use_case.execute(user_id=1)

        self.assertEqual(result[0].id, 11)
        self.assertEqual(result[0].name, "integration")
        self.assertEqual(result[0].prefix, "vq_11")

    def test_create_use_case_returns_output_dto(self):
        repo = _StubApiKeyRepository()
        use_case = CreateApiKeyUseCase(repo)

        result = use_case.execute(user_id=1, name="new", access_level="all")

        self.assertEqual(result.api_key.name, "new")
        self.assertEqual(result.raw_key, "vq_rawkey")
        self.assertEqual(repo.created_name, "new")

    def test_create_use_case_trims_name_before_create(self):
        repo = _StubApiKeyRepository()
        use_case = CreateApiKeyUseCase(repo)

        result = use_case.execute(user_id=1, name="  new  ", access_level="all")

        self.assertEqual(result.api_key.name, "new")
        self.assertEqual(repo.created_name, "new")

    def test_create_use_case_raises_when_duplicate_name_exists(self):
        repo = _StubApiKeyRepository()
        repo.exists = True
        use_case = CreateApiKeyUseCase(repo)

        with self.assertRaises(DuplicateApiKeyName):
            use_case.execute(user_id=1, name="dup", access_level="all")

    def test_create_use_case_raises_when_access_level_invalid(self):
        repo = _StubApiKeyRepository()
        use_case = CreateApiKeyUseCase(repo)

        with self.assertRaises(InvalidApiKeyAccessLevel):
            use_case.execute(user_id=1, name="new", access_level="admin")

    def test_create_use_case_raises_when_name_blank(self):
        repo = _StubApiKeyRepository()
        use_case = CreateApiKeyUseCase(repo)

        with self.assertRaises(InvalidApiKeyName):
            use_case.execute(user_id=1, name="   ", access_level="all")
