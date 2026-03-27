"""Unit tests for GetSubscriptionUseCase."""

from typing import Optional
from unittest import TestCase

from app.domain.billing.entities import PlanType, SubscriptionEntity
from app.domain.billing.ports import SubscriptionRepository
from app.use_cases.billing.get_subscription import GetSubscriptionUseCase


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

    def get_or_create(self, user_id: int) -> SubscriptionEntity:
        return self._entity

    def get_by_user_id(self, user_id: int) -> Optional[SubscriptionEntity]:
        return self._entity

    def get_by_stripe_customer_id(self, customer_id: str) -> Optional[SubscriptionEntity]:
        return None

    def save(self, entity: SubscriptionEntity) -> SubscriptionEntity:
        return entity

    def create_stripe_customer(self, user_id: int, customer_id: str) -> SubscriptionEntity:
        return self._entity

    def clear_stripe_customer(self, user_id: int) -> None:
        pass

    def get_or_create_stripe_customer(self, user_id: int, create_fn, replace_if_stale=None) -> tuple:
        if not self._entity.stripe_customer_id:
            self._entity.stripe_customer_id = create_fn()
        return self._entity.stripe_customer_id, self._entity

    def reset_monthly_usage(self, user_id: int, period_start) -> None:
        pass

    def maybe_reset_monthly_usage(self, user_id: int) -> None:
        pass

    def check_and_reserve_storage(self, user_id: int, additional_bytes: int) -> None:
        pass

    def increment_storage_bytes(self, user_id: int, bytes_delta: int) -> None:
        pass

    def increment_processing_seconds(self, user_id: int, seconds: int) -> None:
        pass

    def increment_ai_answers(self, user_id: int) -> None:
        pass

    def clear_over_quota_if_within_limit(self, user_id: int) -> None:
        pass


class GetSubscriptionUseCaseTests(TestCase):
    def test_subscription_uses_plan_limits(self):
        entity = _make_subscription(plan=PlanType.FREE)
        use_case = GetSubscriptionUseCase(_StubSubscriptionRepo(entity))
        dto = use_case.execute(user_id=1)

        self.assertEqual(dto.plan, "free")
        self.assertEqual(dto.processing_limit_seconds, 10 * 60)
        self.assertEqual(dto.ai_answers_limit, 500)
        self.assertEqual(dto.storage_limit_bytes, 1 * 1024 ** 3)

    def test_is_active_true_for_free_plan(self):
        entity = _make_subscription(plan=PlanType.FREE)
        use_case = GetSubscriptionUseCase(_StubSubscriptionRepo(entity))
        dto = use_case.execute(user_id=1)
        self.assertTrue(dto.is_active)

    def test_used_values_reflected_in_dto(self):
        entity = _make_subscription(
            plan=PlanType.LITE,
            stripe_status="active",
            used_storage_bytes=100,
            used_processing_seconds=300,
            used_ai_answers=50,
        )
        use_case = GetSubscriptionUseCase(_StubSubscriptionRepo(entity))
        dto = use_case.execute(user_id=1)

        self.assertEqual(dto.used_storage_bytes, 100)
        self.assertEqual(dto.used_processing_seconds, 300)
        self.assertEqual(dto.used_ai_answers, 50)
