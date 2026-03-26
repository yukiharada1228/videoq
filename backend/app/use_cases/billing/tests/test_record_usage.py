"""Unit tests for record usage use cases and monthly reset logic."""

from datetime import datetime, timezone, timedelta
from typing import Optional
from unittest import TestCase

from app.domain.billing.entities import PlanType, SubscriptionEntity
from app.domain.billing.ports import SubscriptionRepository
from app.use_cases.billing.record_ai_answer_usage import RecordAiAnswerUsageUseCase
from app.use_cases.billing.record_processing_usage import RecordProcessingUsageUseCase
from app.use_cases.billing.record_storage_usage import RecordStorageUsageUseCase


def _make_subscription(**kwargs) -> SubscriptionEntity:
    defaults = {
        "user_id": 1,
        "plan": PlanType.FREE,
        "stripe_customer_id": None,
        "stripe_subscription_id": None,
        "stripe_status": "",
        "current_period_end": None,
        "cancel_at_period_end": False,
        "used_storage_bytes": 0,
        "used_processing_seconds": 0,
        "used_ai_answers": 0,
        "usage_period_start": None,
        "custom_storage_gb": None,
        "custom_processing_minutes": None,
        "custom_ai_answers": None,
        "unlimited_processing_minutes": False,
        "unlimited_ai_answers": False,
    }
    defaults.update(kwargs)
    return SubscriptionEntity(**defaults)


class _TrackingSubscriptionRepo(SubscriptionRepository):
    """Stub that records all calls for test assertions."""

    def __init__(self, entity: SubscriptionEntity):
        self._entity = entity
        self.saved: Optional[SubscriptionEntity] = None
        self.reset_calls: list = []
        self.maybe_reset_calls: list = []

    def get_or_create(self, user_id: int) -> SubscriptionEntity:
        return self._entity

    def get_by_user_id(self, user_id: int) -> Optional[SubscriptionEntity]:
        return self._entity

    def get_by_stripe_customer_id(self, customer_id: str) -> Optional[SubscriptionEntity]:
        return None

    def save(self, entity: SubscriptionEntity) -> SubscriptionEntity:
        self.saved = entity
        return entity

    def create_stripe_customer(self, user_id: int, customer_id: str) -> SubscriptionEntity:
        return self._entity

    def reset_monthly_usage(self, user_id: int, period_start) -> None:
        self.reset_calls.append((user_id, period_start))

    def maybe_reset_monthly_usage(self, user_id: int) -> None:
        self.maybe_reset_calls.append(user_id)


class RecordStorageUsageTests(TestCase):
    def test_adds_bytes_to_used_storage(self):
        entity = _make_subscription(used_storage_bytes=100)
        repo = _TrackingSubscriptionRepo(entity)
        use_case = RecordStorageUsageUseCase(repo)
        use_case.execute(user_id=1, bytes_delta=500)
        self.assertEqual(repo.saved.used_storage_bytes, 600)

    def test_subtracts_bytes_on_negative_delta(self):
        entity = _make_subscription(used_storage_bytes=1000)
        repo = _TrackingSubscriptionRepo(entity)
        use_case = RecordStorageUsageUseCase(repo)
        use_case.execute(user_id=1, bytes_delta=-300)
        self.assertEqual(repo.saved.used_storage_bytes, 700)

    def test_clamps_to_zero_on_over_subtraction(self):
        entity = _make_subscription(used_storage_bytes=100)
        repo = _TrackingSubscriptionRepo(entity)
        use_case = RecordStorageUsageUseCase(repo)
        use_case.execute(user_id=1, bytes_delta=-500)
        self.assertEqual(repo.saved.used_storage_bytes, 0)

    def test_does_not_call_maybe_reset(self):
        """Storage recording does NOT trigger monthly reset."""
        entity = _make_subscription()
        repo = _TrackingSubscriptionRepo(entity)
        use_case = RecordStorageUsageUseCase(repo)
        use_case.execute(user_id=1, bytes_delta=100)
        self.assertEqual(repo.maybe_reset_calls, [])


class RecordProcessingUsageTests(TestCase):
    def test_adds_seconds_to_used_processing(self):
        entity = _make_subscription(used_processing_seconds=60)
        repo = _TrackingSubscriptionRepo(entity)
        use_case = RecordProcessingUsageUseCase(repo)
        use_case.execute(user_id=1, seconds=120)
        self.assertEqual(repo.saved.used_processing_seconds, 180)

    def test_calls_maybe_reset_before_recording(self):
        entity = _make_subscription(used_processing_seconds=0)
        repo = _TrackingSubscriptionRepo(entity)
        use_case = RecordProcessingUsageUseCase(repo)
        use_case.execute(user_id=1, seconds=30)
        self.assertEqual(repo.maybe_reset_calls, [1])


class RecordAiAnswerUsageTests(TestCase):
    def test_increments_ai_answers_by_one(self):
        entity = _make_subscription(used_ai_answers=5)
        repo = _TrackingSubscriptionRepo(entity)
        use_case = RecordAiAnswerUsageUseCase(repo)
        use_case.execute(user_id=1)
        self.assertEqual(repo.saved.used_ai_answers, 6)

    def test_calls_maybe_reset_before_recording(self):
        entity = _make_subscription(used_ai_answers=0)
        repo = _TrackingSubscriptionRepo(entity)
        use_case = RecordAiAnswerUsageUseCase(repo)
        use_case.execute(user_id=1)
        self.assertEqual(repo.maybe_reset_calls, [1])
