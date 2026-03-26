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
    return SubscriptionEntity(**defaults)


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
    def test_processing_unlimited_with_openai_key(self):
        sub = _make_subscription(plan=PlanType.FREE)
        self.assertIsNone(sub.get_processing_limit_seconds(has_openai_key=True))

    def test_processing_limited_without_openai_key(self):
        sub = _make_subscription(plan=PlanType.FREE)
        expected = 10 * 60  # 10 minutes in seconds
        self.assertEqual(sub.get_processing_limit_seconds(has_openai_key=False), expected)

    def test_processing_unlimited_with_flag(self):
        sub = _make_subscription(plan=PlanType.FREE, unlimited_processing_minutes=True)
        self.assertIsNone(sub.get_processing_limit_seconds(has_openai_key=False))

    def test_processing_limit_custom_minutes(self):
        sub = _make_subscription(plan=PlanType.ENTERPRISE, custom_processing_minutes=300)
        self.assertEqual(sub.get_processing_limit_seconds(has_openai_key=False), 300 * 60)

    def test_processing_limit_lite_plan(self):
        sub = _make_subscription(plan=PlanType.LITE)
        self.assertEqual(sub.get_processing_limit_seconds(has_openai_key=False), 120 * 60)

    def test_processing_limit_standard_plan(self):
        sub = _make_subscription(plan=PlanType.STANDARD)
        self.assertEqual(sub.get_processing_limit_seconds(has_openai_key=False), 600 * 60)


class AiAnswersLimitTests(TestCase):
    def test_ai_answers_unlimited_with_openai_key(self):
        sub = _make_subscription(plan=PlanType.FREE)
        self.assertIsNone(sub.get_ai_answers_limit(has_openai_key=True))

    def test_ai_answers_limited_without_openai_key(self):
        sub = _make_subscription(plan=PlanType.FREE)
        self.assertEqual(sub.get_ai_answers_limit(has_openai_key=False), 500)

    def test_ai_answers_unlimited_with_flag(self):
        sub = _make_subscription(plan=PlanType.FREE, unlimited_ai_answers=True)
        self.assertIsNone(sub.get_ai_answers_limit(has_openai_key=False))

    def test_ai_answers_custom_limit(self):
        sub = _make_subscription(plan=PlanType.ENTERPRISE, custom_ai_answers=9999)
        self.assertEqual(sub.get_ai_answers_limit(has_openai_key=False), 9999)

    def test_ai_answers_lite_plan(self):
        sub = _make_subscription(plan=PlanType.LITE)
        self.assertEqual(sub.get_ai_answers_limit(has_openai_key=False), 3000)


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

    def test_can_process_unlimited_with_openai_key(self):
        limit_seconds = 10 * 60
        sub = _make_subscription(plan=PlanType.FREE, used_processing_seconds=limit_seconds)
        self.assertTrue(sub.can_process(1, has_openai_key=True))


class CanAnswerTests(TestCase):
    def test_can_answer_within_limit(self):
        sub = _make_subscription(plan=PlanType.FREE, used_ai_answers=0)
        self.assertTrue(sub.can_answer())

    def test_can_answer_at_limit(self):
        sub = _make_subscription(plan=PlanType.FREE, used_ai_answers=500)
        self.assertFalse(sub.can_answer())

    def test_can_answer_unlimited_with_openai_key(self):
        sub = _make_subscription(plan=PlanType.FREE, used_ai_answers=500)
        self.assertTrue(sub.can_answer(has_openai_key=True))


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
