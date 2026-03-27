"""Integration tests for DjangoSubscriptionRepository atomic update methods.

These tests exercise the actual DB layer to verify that increment_* methods
perform atomic writes via F() expressions, preventing Lost Update anomalies.
"""
from datetime import datetime, timedelta, timezone

from django.contrib.auth import get_user_model
from django.test import TestCase

from app.domain.billing.exceptions import StorageLimitExceeded
from app.infrastructure.repositories.django_subscription_repository import (
    DjangoSubscriptionRepository,
)
from app.infrastructure.models.subscription import Subscription

User = get_user_model()


def _create_user(username="testuser"):
    return User.objects.create_user(username=username, email=f"{username}@test.example", password="pw")


class IncrementStorageBytesTests(TestCase):
    def setUp(self):
        self.user = _create_user()
        self.repo = DjangoSubscriptionRepository()
        self.repo.get_or_create(self.user.id)

    def test_increments_storage_bytes(self):
        self.repo.increment_storage_bytes(self.user.id, 500)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_storage_bytes, 500)

    def test_subtracts_bytes_on_negative_delta(self):
        Subscription.objects.filter(user_id=self.user.id).update(used_storage_bytes=1000)
        self.repo.increment_storage_bytes(self.user.id, -300)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_storage_bytes, 700)

    def test_clamps_to_zero_on_over_subtraction(self):
        Subscription.objects.filter(user_id=self.user.id).update(used_storage_bytes=100)
        self.repo.increment_storage_bytes(self.user.id, -500)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_storage_bytes, 0)

    def test_sequential_increments_accumulate(self):
        """Simulate two sequential increments that must both be recorded."""
        self.repo.increment_storage_bytes(self.user.id, 500)
        self.repo.increment_storage_bytes(self.user.id, 600)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_storage_bytes, 1100)


class IncrementProcessingSecondsTests(TestCase):
    def setUp(self):
        self.user = _create_user()
        self.repo = DjangoSubscriptionRepository()
        self.repo.get_or_create(self.user.id)

    def test_increments_processing_seconds(self):
        self.repo.increment_processing_seconds(self.user.id, 120)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_processing_seconds, 120)

    def test_sequential_increments_accumulate(self):
        """Simulate two sequential increments that must both be recorded."""
        self.repo.increment_processing_seconds(self.user.id, 60)
        self.repo.increment_processing_seconds(self.user.id, 90)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_processing_seconds, 150)


class IncrementAiAnswersTests(TestCase):
    def setUp(self):
        self.user = _create_user()
        self.repo = DjangoSubscriptionRepository()
        self.repo.get_or_create(self.user.id)

    def test_increments_ai_answers_by_one(self):
        self.repo.increment_ai_answers(self.user.id)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_ai_answers, 1)

    def test_sequential_increments_accumulate(self):
        """Simulate two sequential increments that must both be recorded."""
        self.repo.increment_ai_answers(self.user.id)
        self.repo.increment_ai_answers(self.user.id)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_ai_answers, 2)


class CheckAndReserveStorageTests(TestCase):
    def setUp(self):
        self.user = _create_user()
        self.repo = DjangoSubscriptionRepository()
        self.repo.get_or_create(self.user.id)

    def _limit_bytes(self):
        """FREE plan limit: 1 GB."""
        return 1 * 1024 ** 3

    def test_within_limit_increments_storage(self):
        self.repo.check_and_reserve_storage(self.user.id, 500)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_storage_bytes, 500)

    def test_sequential_reserves_accumulate(self):
        self.repo.check_and_reserve_storage(self.user.id, 300)
        self.repo.check_and_reserve_storage(self.user.id, 200)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_storage_bytes, 500)

    def test_exactly_at_limit_does_not_raise(self):
        limit = self._limit_bytes()
        self.repo.check_and_reserve_storage(self.user.id, limit)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_storage_bytes, limit)

    def test_exceeds_limit_raises_and_does_not_increment(self):
        limit = self._limit_bytes()
        Subscription.objects.filter(user_id=self.user.id).update(
            used_storage_bytes=limit
        )
        with self.assertRaises(StorageLimitExceeded):
            self.repo.check_and_reserve_storage(self.user.id, 1)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_storage_bytes, limit)

    def test_second_request_blocked_when_first_fills_limit(self):
        """Two sequential requests that together exceed the limit — second must be rejected."""
        limit = self._limit_bytes()
        self.repo.check_and_reserve_storage(self.user.id, limit - 100)
        with self.assertRaises(StorageLimitExceeded):
            self.repo.check_and_reserve_storage(self.user.id, 200)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_storage_bytes, limit - 100)

    def test_is_over_quota_blocks_upload_even_when_bytes_available(self):
        """is_over_quota=True must block uploads regardless of remaining bytes."""
        Subscription.objects.filter(user_id=self.user.id).update(is_over_quota=True)
        with self.assertRaises(StorageLimitExceeded):
            self.repo.check_and_reserve_storage(self.user.id, 1)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_storage_bytes, 0)  # not incremented


class ClearOverQuotaIfWithinLimitTests(TestCase):
    def setUp(self):
        self.user = _create_user("quotauser")
        self.repo = DjangoSubscriptionRepository()
        self.repo.get_or_create(self.user.id)

    def test_clears_flag_when_storage_within_free_limit(self):
        Subscription.objects.filter(user_id=self.user.id).update(
            is_over_quota=True, used_storage_bytes=100
        )
        self.repo.clear_over_quota_if_within_limit(self.user.id)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertFalse(obj.is_over_quota)

    def test_does_not_clear_flag_when_still_over_limit(self):
        limit = 1 * 1024 ** 3
        Subscription.objects.filter(user_id=self.user.id).update(
            is_over_quota=True, used_storage_bytes=limit + 1
        )
        self.repo.clear_over_quota_if_within_limit(self.user.id)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertTrue(obj.is_over_quota)

    def test_no_op_when_flag_already_false(self):
        Subscription.objects.filter(user_id=self.user.id).update(
            is_over_quota=False, used_storage_bytes=100
        )
        self.repo.clear_over_quota_if_within_limit(self.user.id)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertFalse(obj.is_over_quota)


class GetOrCreateStripeCustomerTests(TestCase):
    """Integration tests for the atomic get_or_create_stripe_customer method.

    These tests verify that:
    - create_fn is called once and the result is persisted when no customer exists.
    - create_fn is NOT called when a customer ID already exists (idempotent).
    """

    def setUp(self):
        self.user = _create_user("stripeuser")
        self.repo = DjangoSubscriptionRepository()
        self.repo.get_or_create(self.user.id)

    def test_calls_create_fn_and_persists_when_no_customer(self):
        create_fn_calls = []

        def create_fn():
            create_fn_calls.append(True)
            return "cus_new123"

        customer_id, entity = self.repo.get_or_create_stripe_customer(self.user.id, create_fn)

        self.assertEqual(customer_id, "cus_new123")
        self.assertEqual(entity.stripe_customer_id, "cus_new123")
        self.assertEqual(len(create_fn_calls), 1)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.stripe_customer_id, "cus_new123")

    def test_returns_existing_customer_without_calling_create_fn(self):
        Subscription.objects.filter(user_id=self.user.id).update(stripe_customer_id="cus_existing")
        create_fn_calls = []

        def create_fn():
            create_fn_calls.append(True)
            return "cus_should_not_be_created"

        customer_id, entity = self.repo.get_or_create_stripe_customer(self.user.id, create_fn)

        self.assertEqual(customer_id, "cus_existing")
        self.assertEqual(entity.stripe_customer_id, "cus_existing")
        self.assertEqual(len(create_fn_calls), 0)

    def test_creates_subscription_row_if_absent(self):
        """If the subscription row does not exist yet, the method creates it first."""
        new_user = _create_user("newstripeuser")
        create_fn_calls = []

        def create_fn():
            create_fn_calls.append(True)
            return "cus_brand_new"

        customer_id, entity = self.repo.get_or_create_stripe_customer(new_user.id, create_fn)

        self.assertEqual(customer_id, "cus_brand_new")
        self.assertEqual(len(create_fn_calls), 1)
        self.assertTrue(Subscription.objects.filter(user_id=new_user.id).exists())


class MaybeResetMonthlyUsageTests(TestCase):
    def setUp(self):
        self.user = _create_user("resetuser")
        self.repo = DjangoSubscriptionRepository()
        self.repo.get_or_create(self.user.id)

    def _set_subscription(self, **kwargs):
        Subscription.objects.filter(user_id=self.user.id).update(**kwargs)

    def test_first_usage_sets_period_start(self):
        """With no usage_period_start, sets period_start without resetting counters."""
        self._set_subscription(used_processing_seconds=0, used_ai_answers=0)
        self.repo.maybe_reset_monthly_usage(self.user.id)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertIsNotNone(obj.usage_period_start)
        self.assertEqual(obj.used_processing_seconds, 0)

    def test_paid_user_no_reset_before_period_end(self):
        """Paid user: usage is NOT reset when current_period_end is still in the future.

        Regression test for the core bug: 30+ days may have passed since period_start
        but Stripe's billing cycle hasn't ended yet, so usage must not be reset early.
        """
        now = datetime.now(tz=timezone.utc)
        period_end = now + timedelta(days=1)
        period_start = now - timedelta(days=35)  # >30 days ago — old logic would reset
        self._set_subscription(
            current_period_end=period_end,
            usage_period_start=period_start,
            used_processing_seconds=100,
            used_ai_answers=5,
        )
        self.repo.maybe_reset_monthly_usage(self.user.id)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_processing_seconds, 100)
        self.assertEqual(obj.used_ai_answers, 5)

    def test_paid_user_resets_when_period_end_passed(self):
        """Paid user: usage IS reset when now >= current_period_end (Stripe billing cycle ended)."""
        now = datetime.now(tz=timezone.utc)
        period_end = now - timedelta(seconds=1)
        period_start = now - timedelta(days=31)
        self._set_subscription(
            current_period_end=period_end,
            usage_period_start=period_start,
            used_processing_seconds=100,
            used_ai_answers=5,
        )
        self.repo.maybe_reset_monthly_usage(self.user.id)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_processing_seconds, 0)
        self.assertEqual(obj.used_ai_answers, 0)

    def test_free_user_no_reset_same_month(self):
        """Free user: no reset when still in the same calendar month."""
        now = datetime.now(tz=timezone.utc)
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        self._set_subscription(
            current_period_end=None,
            usage_period_start=period_start,
            used_processing_seconds=50,
            used_ai_answers=2,
        )
        self.repo.maybe_reset_monthly_usage(self.user.id)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_processing_seconds, 50)
        self.assertEqual(obj.used_ai_answers, 2)

    def test_free_user_resets_on_new_month(self):
        """Free user: usage IS reset when calendar month has changed."""
        now = datetime.now(tz=timezone.utc)
        if now.month == 1:
            prev_month = now.replace(year=now.year - 1, month=12, day=1)
        else:
            prev_month = now.replace(month=now.month - 1, day=1)
        self._set_subscription(
            current_period_end=None,
            usage_period_start=prev_month,
            used_processing_seconds=50,
            used_ai_answers=2,
        )
        self.repo.maybe_reset_monthly_usage(self.user.id)
        obj = Subscription.objects.get(user_id=self.user.id)
        self.assertEqual(obj.used_processing_seconds, 0)
        self.assertEqual(obj.used_ai_answers, 0)
