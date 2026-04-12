"""Unit tests for record usage use cases and monthly reset logic."""

from typing import Optional
from unittest import TestCase

from app.domain.billing.entities import UserLimitsEntity
from app.domain.billing.ports import UserLimitsRepository
from app.use_cases.billing.record_ai_answer_usage import RecordAiAnswerUsageUseCase
from app.use_cases.billing.record_processing_usage import RecordProcessingUsageUseCase
from app.use_cases.billing.record_storage_usage import RecordStorageUsageUseCase


def _make_user_limits(**kwargs) -> UserLimitsEntity:
    defaults = {
        "user_id": 1,
        "storage_limit_gb": 50.0,
        "processing_limit_minutes": 600,
        "ai_answers_limit": 7000,
        "used_storage_bytes": 0,
        "used_processing_seconds": 0,
        "used_ai_answers": 0,
        "usage_period_start": None,
        "unlimited_processing_minutes": False,
        "unlimited_ai_answers": False,
    }
    defaults.update(kwargs)
    return UserLimitsEntity(**defaults)  # type: ignore[arg-type]


class _TrackingUserLimitsRepo(UserLimitsRepository):
    """Stub that records all calls for test assertions."""

    def __init__(self, entity: UserLimitsEntity):
        self._entity = entity
        self.saved: Optional[UserLimitsEntity] = None
        self.reset_calls: list = []
        self.maybe_reset_calls: list = []
        self.increment_storage_calls: list = []
        self.increment_processing_calls: list = []
        self.increment_ai_answer_calls: list = []

    def get_or_create(self, user_id: int) -> UserLimitsEntity:
        return self._entity

    def get_by_user_id(self, user_id: int) -> Optional[UserLimitsEntity]:
        return self._entity

    def save(self, entity: UserLimitsEntity) -> UserLimitsEntity:
        self.saved = entity
        return entity

    def reset_monthly_usage(self, user_id: int, period_start) -> None:
        self.reset_calls.append((user_id, period_start))

    def maybe_reset_monthly_usage(self, user_id: int) -> None:
        self.maybe_reset_calls.append(user_id)

    def check_and_reserve_storage(self, user_id: int, additional_bytes: int) -> None:
        pass

    def increment_storage_bytes(self, user_id: int, bytes_delta: int) -> None:
        self.increment_storage_calls.append((user_id, bytes_delta))

    def increment_processing_seconds(self, user_id: int, seconds: int) -> None:
        self.increment_processing_calls.append((user_id, seconds))

    def increment_ai_answers(self, user_id: int) -> None:
        self.increment_ai_answer_calls.append(user_id)

    def clear_over_quota_if_within_limit(self, user_id: int) -> None:
        pass


class RecordStorageUsageTests(TestCase):
    def test_delegates_to_atomic_increment(self):
        """Use case must call increment_storage_bytes instead of get→save."""
        entity = _make_user_limits(used_storage_bytes=100)
        repo = _TrackingUserLimitsRepo(entity)
        use_case = RecordStorageUsageUseCase(repo)
        use_case.execute(user_id=1, bytes_delta=500)
        self.assertEqual(repo.increment_storage_calls, [(1, 500)])

    def test_passes_negative_delta_to_repo(self):
        """Negative delta (file deletion) is passed through to the repo for atomic clamping."""
        entity = _make_user_limits(used_storage_bytes=1000)
        repo = _TrackingUserLimitsRepo(entity)
        use_case = RecordStorageUsageUseCase(repo)
        use_case.execute(user_id=1, bytes_delta=-300)
        self.assertEqual(repo.increment_storage_calls, [(1, -300)])

    def test_does_not_call_save(self):
        """save() must NOT be called — the repo handles the atomic write."""
        entity = _make_user_limits()
        repo = _TrackingUserLimitsRepo(entity)
        use_case = RecordStorageUsageUseCase(repo)
        use_case.execute(user_id=1, bytes_delta=100)
        self.assertIsNone(repo.saved)

    def test_does_not_call_maybe_reset(self):
        """Storage recording does NOT trigger monthly reset."""
        entity = _make_user_limits()
        repo = _TrackingUserLimitsRepo(entity)
        use_case = RecordStorageUsageUseCase(repo)
        use_case.execute(user_id=1, bytes_delta=100)
        self.assertEqual(repo.maybe_reset_calls, [])


class RecordProcessingUsageTests(TestCase):
    def test_delegates_to_atomic_increment(self):
        """Use case must call increment_processing_seconds instead of get→save."""
        entity = _make_user_limits(used_processing_seconds=60)
        repo = _TrackingUserLimitsRepo(entity)
        use_case = RecordProcessingUsageUseCase(repo)
        use_case.execute(user_id=1, seconds=120)
        self.assertEqual(repo.increment_processing_calls, [(1, 120)])

    def test_calls_maybe_reset_before_recording(self):
        entity = _make_user_limits(used_processing_seconds=0)
        repo = _TrackingUserLimitsRepo(entity)
        use_case = RecordProcessingUsageUseCase(repo)
        use_case.execute(user_id=1, seconds=30)
        self.assertEqual(repo.maybe_reset_calls, [1])

    def test_does_not_call_save(self):
        """save() must NOT be called — the repo handles the atomic write."""
        entity = _make_user_limits()
        repo = _TrackingUserLimitsRepo(entity)
        use_case = RecordProcessingUsageUseCase(repo)
        use_case.execute(user_id=1, seconds=60)
        self.assertIsNone(repo.saved)


class RecordAiAnswerUsageTests(TestCase):
    def test_delegates_to_atomic_increment(self):
        """Use case must call increment_ai_answers instead of get→save."""
        entity = _make_user_limits(used_ai_answers=5)
        repo = _TrackingUserLimitsRepo(entity)
        use_case = RecordAiAnswerUsageUseCase(repo)
        use_case.execute(user_id=1)
        self.assertEqual(repo.increment_ai_answer_calls, [1])

    def test_calls_maybe_reset_before_recording(self):
        entity = _make_user_limits(used_ai_answers=0)
        repo = _TrackingUserLimitsRepo(entity)
        use_case = RecordAiAnswerUsageUseCase(repo)
        use_case.execute(user_id=1)
        self.assertEqual(repo.maybe_reset_calls, [1])

    def test_does_not_call_save(self):
        """save() must NOT be called — the repo handles the atomic write."""
        entity = _make_user_limits()
        repo = _TrackingUserLimitsRepo(entity)
        use_case = RecordAiAnswerUsageUseCase(repo)
        use_case.execute(user_id=1)
        self.assertIsNone(repo.saved)
