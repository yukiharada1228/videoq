"""Tests for GetCurrentUserUseCase."""

import unittest

from app.domain.user.entities import UserEntity
from app.domain.user.repositories import UserRepository
from app.use_cases.auth.get_current_user import GetCurrentUserUseCase
from app.use_cases.shared.exceptions import ResourceNotFound


class _StubUserRepository(UserRepository):
    def __init__(self, by_id=None, with_count=None):
        self._by_id = by_id
        self._with_count = with_count

    def get_by_id(self, user_id: int):
        return self._by_id

    def get_with_video_count(self, user_id: int):
        return self._with_count

    def has_searchapi_api_key(self, user_id: int) -> bool:
        return False

    def set_searchapi_api_key(self, user_id: int, api_key: str) -> bool:
        return True

    def delete_searchapi_api_key(self, user_id: int) -> bool:
        return True


class GetCurrentUserUseCaseTests(unittest.TestCase):
    def test_execute_returns_user_when_found(self):
        user = UserEntity(
            id=1,
            username="u1",
            email="u1@example.com",
            is_active=True,
            video_count=3,
        )
        use_case = GetCurrentUserUseCase(_StubUserRepository(with_count=user))

        result = use_case.execute(1)

        self.assertEqual(result.id, 1)
        self.assertEqual(result.username, "u1")
        self.assertEqual(result.video_count, 3)

    def test_current_user_includes_max_video_upload_size_mb(self):
        user = UserEntity(
            id=1,
            username="u1",
            email="u1@example.com",
            is_active=True,
            max_video_upload_size_mb=1000,
            video_count=3,
        )
        use_case = GetCurrentUserUseCase(_StubUserRepository(with_count=user))

        result = use_case.execute(1)

        self.assertEqual(result.max_video_upload_size_mb, 1000)

    def test_current_user_includes_usage_and_limit_fields(self):
        user = UserEntity(
            id=1,
            username="u1",
            email="u1@example.com",
            is_active=True,
            video_count=3,
            storage_limit_gb=12.5,
            processing_limit_minutes=180,
            ai_answers_limit=7000,
            used_storage_bytes=1024,
            used_processing_seconds=3600,
            used_ai_answers=24,
            is_over_quota=True,
        )
        use_case = GetCurrentUserUseCase(_StubUserRepository(with_count=user))

        result = use_case.execute(1)

        self.assertEqual(result.used_storage_bytes, 1024)
        self.assertEqual(result.storage_limit_bytes, int(12.5 * 1024 ** 3))
        self.assertEqual(result.used_processing_seconds, 3600)
        self.assertEqual(result.processing_limit_seconds, 180 * 60)
        self.assertEqual(result.used_ai_answers, 24)
        self.assertEqual(result.ai_answers_limit, 7000)
        self.assertTrue(result.is_over_quota)

    def test_execute_raises_resource_not_found_when_missing(self):
        use_case = GetCurrentUserUseCase(_StubUserRepository(with_count=None))

        with self.assertRaises(ResourceNotFound):
            use_case.execute(999)
