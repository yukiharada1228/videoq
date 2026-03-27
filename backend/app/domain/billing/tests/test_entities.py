"""Unit tests for billing domain entities."""

from unittest import TestCase

from app.domain.billing.entities import PlanType, SubscriptionEntity


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


class StorageLimitTests(TestCase):
    def test_storage_limit_free_plan(self):
        sub = _make_subscription(plan=PlanType.FREE)
        expected = 1 * 1024 ** 3
        self.assertEqual(sub.get_storage_limit_bytes(), expected)

    def test_storage_limit_lite_plan(self):
        sub = _make_subscription(plan=PlanType.LITE)
        expected = 10 * 1024 ** 3
        self.assertEqual(sub.get_storage_limit_bytes(), expected)

    def test_storage_limit_standard_plan(self):
        sub = _make_subscription(plan=PlanType.STANDARD)
        expected = 50 * 1024 ** 3
        self.assertEqual(sub.get_storage_limit_bytes(), expected)

    def test_storage_limit_enterprise_custom(self):
        sub = _make_subscription(plan=PlanType.ENTERPRISE, custom_storage_gb=100.0)
        expected = int(100.0 * 1024 ** 3)
        self.assertEqual(sub.get_storage_limit_bytes(), expected)

    def test_storage_limit_enterprise_no_custom_returns_none(self):
        sub = _make_subscription(plan=PlanType.ENTERPRISE)
        self.assertIsNone(sub.get_storage_limit_bytes())


class ProcessingLimitTests(TestCase):
    def test_processing_limited_for_free_plan(self):
        sub = _make_subscription(plan=PlanType.FREE)
        expected = 10 * 60  # 10 minutes in seconds
        self.assertEqual(sub.get_processing_limit_seconds(), expected)

    def test_processing_unlimited_with_flag(self):
        sub = _make_subscription(plan=PlanType.FREE, unlimited_processing_minutes=True)
        self.assertIsNone(sub.get_processing_limit_seconds())

    def test_processing_limit_custom_minutes(self):
        sub = _make_subscription(plan=PlanType.ENTERPRISE, custom_processing_minutes=300)
        self.assertEqual(sub.get_processing_limit_seconds(), 300 * 60)

    def test_processing_limit_lite_plan(self):
        sub = _make_subscription(plan=PlanType.LITE)
        self.assertEqual(sub.get_processing_limit_seconds(), 120 * 60)

    def test_processing_limit_standard_plan(self):
        sub = _make_subscription(plan=PlanType.STANDARD)
        self.assertEqual(sub.get_processing_limit_seconds(), 600 * 60)


class AiAnswersLimitTests(TestCase):
    def test_ai_answers_limited_for_free_plan(self):
        sub = _make_subscription(plan=PlanType.FREE)
        self.assertEqual(sub.get_ai_answers_limit(), 500)

    def test_ai_answers_unlimited_with_flag(self):
        sub = _make_subscription(plan=PlanType.FREE, unlimited_ai_answers=True)
        self.assertIsNone(sub.get_ai_answers_limit())

    def test_ai_answers_custom_limit(self):
        sub = _make_subscription(plan=PlanType.ENTERPRISE, custom_ai_answers=9999)
        self.assertEqual(sub.get_ai_answers_limit(), 9999)

    def test_ai_answers_lite_plan(self):
        sub = _make_subscription(plan=PlanType.LITE)
        self.assertEqual(sub.get_ai_answers_limit(), 3000)

    def test_ai_answers_standard_plan(self):
        sub = _make_subscription(plan=PlanType.STANDARD)
        self.assertEqual(sub.get_ai_answers_limit(), 7000)

    def test_ai_answers_enterprise_no_custom_returns_none(self):
        sub = _make_subscription(plan=PlanType.ENTERPRISE)
        self.assertIsNone(sub.get_ai_answers_limit())


class CanUseStorageTests(TestCase):
    def test_can_use_storage_within_limit(self):
        limit_bytes = 1 * 1024 ** 3  # 1 GB
        sub = _make_subscription(plan=PlanType.FREE, used_storage_bytes=0)
        self.assertTrue(sub.can_use_storage(limit_bytes))

    def test_can_use_storage_exceeds_limit(self):
        limit_bytes = 1 * 1024 ** 3  # 1 GB
        sub = _make_subscription(plan=PlanType.FREE, used_storage_bytes=limit_bytes)
        self.assertFalse(sub.can_use_storage(1))

    def test_can_use_storage_exactly_at_limit(self):
        limit_bytes = 1 * 1024 ** 3
        sub = _make_subscription(plan=PlanType.FREE, used_storage_bytes=0)
        self.assertTrue(sub.can_use_storage(limit_bytes))

    def test_can_use_storage_unlimited(self):
        sub = _make_subscription(plan=PlanType.ENTERPRISE)
        self.assertTrue(sub.can_use_storage(10 * 1024 ** 3))


class CanProcessTests(TestCase):
    def test_can_process_within_limit(self):
        sub = _make_subscription(plan=PlanType.FREE, used_processing_seconds=0)
        self.assertTrue(sub.can_process(60))  # 1 minute, limit is 10 minutes

    def test_can_process_exceeds_limit(self):
        limit_seconds = 10 * 60
        sub = _make_subscription(plan=PlanType.FREE, used_processing_seconds=limit_seconds)
        self.assertFalse(sub.can_process(1))


class CanAnswerTests(TestCase):
    def test_can_answer_within_limit(self):
        sub = _make_subscription(plan=PlanType.FREE, used_ai_answers=0)
        self.assertTrue(sub.can_answer())

    def test_can_answer_at_limit(self):
        sub = _make_subscription(plan=PlanType.FREE, used_ai_answers=500)
        self.assertFalse(sub.can_answer())

    def test_can_answer_lite_within_limit(self):
        sub = _make_subscription(plan=PlanType.LITE, used_ai_answers=2999)
        self.assertTrue(sub.can_answer())

    def test_can_answer_lite_at_limit(self):
        sub = _make_subscription(plan=PlanType.LITE, used_ai_answers=3000)
        self.assertFalse(sub.can_answer())

    def test_can_answer_standard_within_limit(self):
        sub = _make_subscription(plan=PlanType.STANDARD, used_ai_answers=6999)
        self.assertTrue(sub.can_answer())

    def test_can_answer_standard_at_limit(self):
        sub = _make_subscription(plan=PlanType.STANDARD, used_ai_answers=7000)
        self.assertFalse(sub.can_answer())

    def test_can_answer_enterprise_unlimited(self):
        sub = _make_subscription(plan=PlanType.ENTERPRISE, unlimited_ai_answers=True, used_ai_answers=999999)
        self.assertTrue(sub.can_answer())

class IsStripeActiveTests(TestCase):
    def test_free_plan_always_active(self):
        sub = _make_subscription(plan=PlanType.FREE, stripe_status="")
        self.assertTrue(sub.is_stripe_active)

    def test_enterprise_always_active(self):
        sub = _make_subscription(plan=PlanType.ENTERPRISE, stripe_status="")
        self.assertTrue(sub.is_stripe_active)

    def test_paid_plan_active_with_active_status(self):
        sub = _make_subscription(plan=PlanType.LITE, stripe_status="active")
        self.assertTrue(sub.is_stripe_active)

    def test_paid_plan_active_with_trialing_status(self):
        sub = _make_subscription(plan=PlanType.STANDARD, stripe_status="trialing")
        self.assertTrue(sub.is_stripe_active)

    def test_paid_plan_inactive_with_canceled_status(self):
        sub = _make_subscription(plan=PlanType.LITE, stripe_status="canceled")
        self.assertFalse(sub.is_stripe_active)

    def test_cancel_at_period_end_active_status_is_not_active(self):
        """A subscription scheduled for cancellation should not be treated as active."""
        sub = _make_subscription(
            plan=PlanType.LITE, stripe_status="active", cancel_at_period_end=True
        )
        self.assertFalse(sub.is_stripe_active)

    def test_cancel_at_period_end_trialing_status_is_not_active(self):
        sub = _make_subscription(
            plan=PlanType.STANDARD, stripe_status="trialing", cancel_at_period_end=True
        )
        self.assertFalse(sub.is_stripe_active)


class IsPendingCancellationTests(TestCase):
    def test_pending_cancellation_with_active_status(self):
        sub = _make_subscription(
            plan=PlanType.LITE, stripe_status="active", cancel_at_period_end=True
        )
        self.assertTrue(sub.is_pending_cancellation)

    def test_pending_cancellation_with_trialing_status(self):
        sub = _make_subscription(
            plan=PlanType.STANDARD, stripe_status="trialing", cancel_at_period_end=True
        )
        self.assertTrue(sub.is_pending_cancellation)

    def test_not_pending_when_cancel_at_period_end_is_false(self):
        sub = _make_subscription(
            plan=PlanType.LITE, stripe_status="active", cancel_at_period_end=False
        )
        self.assertFalse(sub.is_pending_cancellation)

    def test_not_pending_when_already_canceled(self):
        sub = _make_subscription(
            plan=PlanType.LITE, stripe_status="canceled", cancel_at_period_end=True
        )
        self.assertFalse(sub.is_pending_cancellation)

    def test_free_plan_never_pending_cancellation(self):
        sub = _make_subscription(
            plan=PlanType.FREE, stripe_status="", cancel_at_period_end=True
        )
        self.assertFalse(sub.is_pending_cancellation)

    def test_enterprise_plan_never_pending_cancellation(self):
        sub = _make_subscription(
            plan=PlanType.ENTERPRISE, stripe_status="", cancel_at_period_end=True
        )
        self.assertFalse(sub.is_pending_cancellation)
