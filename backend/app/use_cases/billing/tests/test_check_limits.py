"""Unit tests for check limit use cases."""

from typing import Optional
from unittest import TestCase

from app.domain.billing.entities import PlanType, SubscriptionEntity
from app.domain.billing.exceptions import (
    AiAnswersLimitExceeded,
    OverQuotaError,
    ProcessingLimitExceeded,
    StorageLimitExceeded,
)
from app.domain.billing.ports import SubscriptionRepository
from app.use_cases.billing.check_ai_answers_limit import CheckAiAnswersLimitUseCase
from app.use_cases.billing.check_processing_limit import CheckProcessingLimitUseCase
from app.use_cases.billing.check_storage_limit import CheckStorageLimitUseCase


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
    return SubscriptionEntity(**defaults)  # type: ignore[arg-type]


class _StubSubscriptionRepo(SubscriptionRepository):
    def __init__(self, entity: SubscriptionEntity):
        self._entity = entity
        self.saved: Optional[SubscriptionEntity] = None
        self.check_and_reserve_calls: list = []

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
        pass

    def maybe_reset_monthly_usage(self, user_id: int) -> None:
        pass

    def check_and_reserve_storage(self, user_id: int, additional_bytes: int) -> None:
        self.check_and_reserve_calls.append((user_id, additional_bytes))
        if self._entity.is_over_quota:
            raise StorageLimitExceeded("Storage limit exceeded: account is over quota.")
        if not self._entity.can_use_storage(additional_bytes):
            raise StorageLimitExceeded(
                f"Storage limit exceeded. Limit: {self._entity.get_storage_limit_bytes()} bytes."
            )
        self._entity.used_storage_bytes += additional_bytes

    def increment_storage_bytes(self, user_id: int, bytes_delta: int) -> None:
        pass

    def increment_processing_seconds(self, user_id: int, seconds: int) -> None:
        pass

    def increment_ai_answers(self, user_id: int) -> None:
        pass

    def clear_over_quota_if_within_limit(self, user_id: int) -> None:
        pass


class CheckStorageLimitTests(TestCase):
    def test_delegates_to_check_and_reserve_storage(self):
        """Use case must delegate to atomic check_and_reserve_storage on the repo."""
        entity = _make_subscription(plan=PlanType.FREE, used_storage_bytes=0)
        repo = _StubSubscriptionRepo(entity)
        use_case = CheckStorageLimitUseCase(repo)
        use_case.execute(user_id=7, additional_bytes=512)
        self.assertEqual(repo.check_and_reserve_calls, [(7, 512)])

    def test_storage_reserved_on_success(self):
        """used_storage_bytes must be incremented when check passes."""
        entity = _make_subscription(plan=PlanType.FREE, used_storage_bytes=0)
        use_case = CheckStorageLimitUseCase(_StubSubscriptionRepo(entity))
        use_case.execute(user_id=1, additional_bytes=100)
        self.assertEqual(entity.used_storage_bytes, 100)

    def test_storage_within_limit_does_not_raise(self):
        entity = _make_subscription(plan=PlanType.FREE, used_storage_bytes=0)
        use_case = CheckStorageLimitUseCase(_StubSubscriptionRepo(entity))
        use_case.execute(user_id=1, additional_bytes=100)

    def test_storage_exceeded_raises(self):
        limit_bytes = 1 * 1024 ** 3
        entity = _make_subscription(plan=PlanType.FREE, used_storage_bytes=limit_bytes)
        use_case = CheckStorageLimitUseCase(_StubSubscriptionRepo(entity))
        with self.assertRaises(StorageLimitExceeded):
            use_case.execute(user_id=1, additional_bytes=1)

    def test_storage_lite_within_limit_does_not_raise(self):
        entity = _make_subscription(plan=PlanType.LITE, used_storage_bytes=0)
        use_case = CheckStorageLimitUseCase(_StubSubscriptionRepo(entity))
        use_case.execute(user_id=1, additional_bytes=10 * 1024 ** 3)

    def test_storage_lite_exceeded_raises(self):
        entity = _make_subscription(plan=PlanType.LITE, used_storage_bytes=10 * 1024 ** 3)
        use_case = CheckStorageLimitUseCase(_StubSubscriptionRepo(entity))
        with self.assertRaises(StorageLimitExceeded):
            use_case.execute(user_id=1, additional_bytes=1)

    def test_storage_standard_within_limit_does_not_raise(self):
        entity = _make_subscription(plan=PlanType.STANDARD, used_storage_bytes=0)
        use_case = CheckStorageLimitUseCase(_StubSubscriptionRepo(entity))
        use_case.execute(user_id=1, additional_bytes=50 * 1024 ** 3)

    def test_storage_standard_exceeded_raises(self):
        entity = _make_subscription(plan=PlanType.STANDARD, used_storage_bytes=50 * 1024 ** 3)
        use_case = CheckStorageLimitUseCase(_StubSubscriptionRepo(entity))
        with self.assertRaises(StorageLimitExceeded):
            use_case.execute(user_id=1, additional_bytes=1)

    def test_storage_enterprise_unlimited_does_not_raise(self):
        entity = _make_subscription(plan=PlanType.ENTERPRISE, used_storage_bytes=100 * 1024 ** 3)
        use_case = CheckStorageLimitUseCase(_StubSubscriptionRepo(entity))
        use_case.execute(user_id=1, additional_bytes=100 * 1024 ** 3)


    def test_storage_over_quota_flag_raises_even_when_bytes_available(self):
        """is_over_quota=True must block uploads regardless of remaining bytes."""
        entity = _make_subscription(
            plan=PlanType.FREE, used_storage_bytes=0, is_over_quota=True
        )
        repo = _StubSubscriptionRepo(entity)
        use_case = CheckStorageLimitUseCase(repo)
        with self.assertRaises(StorageLimitExceeded):
            use_case.execute(user_id=1, additional_bytes=1)


class CheckProcessingLimitTests(TestCase):
    def test_processing_within_limit_does_not_raise(self):
        entity = _make_subscription(plan=PlanType.FREE, used_processing_seconds=0)
        use_case = CheckProcessingLimitUseCase(_StubSubscriptionRepo(entity))
        use_case.execute(user_id=1, additional_seconds=60)

    def test_processing_exceeded_without_key_raises(self):
        limit_seconds = 10 * 60
        entity = _make_subscription(
            plan=PlanType.FREE, used_processing_seconds=limit_seconds
        )
        use_case = CheckProcessingLimitUseCase(_StubSubscriptionRepo(entity))
        with self.assertRaises(ProcessingLimitExceeded):
            use_case.execute(user_id=1, additional_seconds=1)

    def test_processing_lite_within_limit_does_not_raise(self):
        entity = _make_subscription(plan=PlanType.LITE, used_processing_seconds=0)
        use_case = CheckProcessingLimitUseCase(_StubSubscriptionRepo(entity))
        use_case.execute(user_id=1, additional_seconds=120 * 60)

    def test_processing_lite_exceeded_raises(self):
        entity = _make_subscription(plan=PlanType.LITE, used_processing_seconds=120 * 60)
        use_case = CheckProcessingLimitUseCase(_StubSubscriptionRepo(entity))
        with self.assertRaises(ProcessingLimitExceeded):
            use_case.execute(user_id=1, additional_seconds=1)

    def test_processing_standard_within_limit_does_not_raise(self):
        entity = _make_subscription(plan=PlanType.STANDARD, used_processing_seconds=0)
        use_case = CheckProcessingLimitUseCase(_StubSubscriptionRepo(entity))
        use_case.execute(user_id=1, additional_seconds=600 * 60)

    def test_processing_standard_exceeded_raises(self):
        entity = _make_subscription(plan=PlanType.STANDARD, used_processing_seconds=600 * 60)
        use_case = CheckProcessingLimitUseCase(_StubSubscriptionRepo(entity))
        with self.assertRaises(ProcessingLimitExceeded):
            use_case.execute(user_id=1, additional_seconds=1)

    def test_processing_enterprise_unlimited_does_not_raise(self):
        entity = _make_subscription(
            plan=PlanType.ENTERPRISE, unlimited_processing_minutes=True,
            used_processing_seconds=9999 * 60
        )
        use_case = CheckProcessingLimitUseCase(_StubSubscriptionRepo(entity))
        use_case.execute(user_id=1, additional_seconds=9999 * 60)


class CheckAiAnswersLimitTests(TestCase):
    def test_ai_answers_within_limit_does_not_raise(self):
        entity = _make_subscription(plan=PlanType.FREE, used_ai_answers=0)
        use_case = CheckAiAnswersLimitUseCase(_StubSubscriptionRepo(entity))
        use_case.execute(user_id=1)

    def test_ai_answers_exceeded_raises(self):
        entity = _make_subscription(plan=PlanType.FREE, used_ai_answers=500)
        use_case = CheckAiAnswersLimitUseCase(_StubSubscriptionRepo(entity))
        with self.assertRaises(AiAnswersLimitExceeded):
            use_case.execute(user_id=1)

    def test_ai_answers_lite_within_limit_does_not_raise(self):
        entity = _make_subscription(plan=PlanType.LITE, used_ai_answers=2999)
        use_case = CheckAiAnswersLimitUseCase(_StubSubscriptionRepo(entity))
        use_case.execute(user_id=1)

    def test_ai_answers_lite_exceeded_raises(self):
        entity = _make_subscription(plan=PlanType.LITE, used_ai_answers=3000)
        use_case = CheckAiAnswersLimitUseCase(_StubSubscriptionRepo(entity))
        with self.assertRaises(AiAnswersLimitExceeded):
            use_case.execute(user_id=1)

    def test_ai_answers_standard_within_limit_does_not_raise(self):
        entity = _make_subscription(plan=PlanType.STANDARD, used_ai_answers=6999)
        use_case = CheckAiAnswersLimitUseCase(_StubSubscriptionRepo(entity))
        use_case.execute(user_id=1)

    def test_ai_answers_standard_at_limit_raises(self):
        entity = _make_subscription(plan=PlanType.STANDARD, used_ai_answers=7000)
        use_case = CheckAiAnswersLimitUseCase(_StubSubscriptionRepo(entity))
        with self.assertRaises(AiAnswersLimitExceeded):
            use_case.execute(user_id=1)

    def test_ai_answers_enterprise_unlimited_does_not_raise(self):
        entity = _make_subscription(
            plan=PlanType.ENTERPRISE, unlimited_ai_answers=True, used_ai_answers=999999
        )
        use_case = CheckAiAnswersLimitUseCase(_StubSubscriptionRepo(entity))
        use_case.execute(user_id=1)

    def test_ai_answers_raises_over_quota_error_when_is_over_quota(self):
        """is_over_quota=True must block AI chat regardless of answer count."""
        entity = _make_subscription(
            plan=PlanType.STANDARD, used_ai_answers=0, is_over_quota=True
        )
        use_case = CheckAiAnswersLimitUseCase(_StubSubscriptionRepo(entity))
        with self.assertRaises(OverQuotaError):
            use_case.execute(user_id=1)

    def test_ai_answers_does_not_raise_over_quota_when_flag_false(self):
        """is_over_quota=False must not affect the normal AI answers check."""
        entity = _make_subscription(
            plan=PlanType.STANDARD, used_ai_answers=0, is_over_quota=False
        )
        use_case = CheckAiAnswersLimitUseCase(_StubSubscriptionRepo(entity))
        use_case.execute(user_id=1)  # should not raise
