"""Unit tests for HandleWebhookUseCase."""

import logging
from typing import Optional
from unittest import TestCase
from unittest.mock import MagicMock

from app.domain.billing.entities import PlanType, SubscriptionEntity
from app.domain.billing.ports import (
    BillingGateway,
    SubscriptionEventData,
    SubscriptionRepository,
    WebhookEvent,
)
from app.use_cases.billing.handle_webhook import HandleWebhookUseCase


def _make_subscription(**kwargs) -> SubscriptionEntity:
    defaults = {
        "user_id": 1,
        "plan": PlanType.FREE,
        "stripe_customer_id": "cus_test",
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

    def get_or_create(self, user_id: int) -> SubscriptionEntity:
        return self._entity

    def get_by_user_id(self, user_id: int) -> Optional[SubscriptionEntity]:
        return self._entity

    def get_by_stripe_customer_id(self, customer_id: str) -> Optional[SubscriptionEntity]:
        if customer_id == self._entity.stripe_customer_id:
            return self._entity
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


class _StubBillingGateway(BillingGateway):
    def __init__(self, event: WebhookEvent):
        self._event = event

    def get_or_create_customer(self, user_id, email, username) -> str:
        return "cus_test"

    def create_checkout_session(self, customer_id, price_id, success_url, cancel_url, user_id, plan):
        return MagicMock(url="https://checkout.test")

    def update_subscription(self, subscription_id, price_id) -> None:
        pass

    def create_billing_portal(self, customer_id, return_url):
        return MagicMock(url="https://portal.test")

    def verify_webhook(self, payload, sig_header, secret) -> WebhookEvent:
        return self._event

    def cancel_subscription(self, subscription_id: str) -> None:
        pass


PRICE_MAP = {"price_lite_001": "lite", "price_standard_001": "standard"}


def _make_event(
    event_type: str,
    *,
    id: str = "",
    customer: str = "",
    status: str = "",
    cancel_at_period_end: bool = False,
    current_period_end: Optional[int] = None,
    price_id: Optional[str] = None,
) -> WebhookEvent:
    return WebhookEvent(
        type=event_type,
        data_object=SubscriptionEventData(
            id=id,
            customer=customer,
            status=status,
            cancel_at_period_end=cancel_at_period_end,
            current_period_end=current_period_end,
            price_id=price_id,
        ),
    )


def _make_use_case(entity: SubscriptionEntity, event: WebhookEvent) -> HandleWebhookUseCase:
    return HandleWebhookUseCase(
        subscription_repo=_StubSubscriptionRepo(entity),
        billing_gateway=_StubBillingGateway(event),
        webhook_secret="whsec_test",
        price_map=PRICE_MAP,
    )


class SubscriptionCreatedTests(TestCase):
    def test_subscription_created_syncs_plan_and_status(self):
        entity = _make_subscription(plan=PlanType.FREE)
        event = _make_event(
            "customer.subscription.created",
            id="sub_new",
            customer="cus_test",
            status="active",
            cancel_at_period_end=False,
            current_period_end=1893456000,
            price_id="price_lite_001",
        )
        repo = _StubSubscriptionRepo(entity)
        use_case = HandleWebhookUseCase(
            subscription_repo=repo,
            billing_gateway=_StubBillingGateway(event),
            webhook_secret="whsec_test",
            price_map=PRICE_MAP,
        )
        use_case.execute(payload=b"payload", sig_header="sig")

        self.assertIsNotNone(repo.saved)
        self.assertEqual(repo.saved.plan, PlanType.LITE)
        self.assertEqual(repo.saved.stripe_status, "active")
        self.assertEqual(repo.saved.stripe_subscription_id, "sub_new")


class SubscriptionUpdatedTests(TestCase):
    def test_subscription_updated_syncs_changes(self):
        entity = _make_subscription(
            plan=PlanType.LITE,
            stripe_subscription_id="sub_existing",
            stripe_status="active",
        )
        event = _make_event(
            "customer.subscription.updated",
            id="sub_existing",
            customer="cus_test",
            status="active",
            cancel_at_period_end=True,
            current_period_end=1893456000,
            price_id="price_standard_001",
        )
        repo = _StubSubscriptionRepo(entity)
        use_case = HandleWebhookUseCase(
            subscription_repo=repo,
            billing_gateway=_StubBillingGateway(event),
            webhook_secret="whsec_test",
            price_map=PRICE_MAP,
        )
        use_case.execute(payload=b"payload", sig_header="sig")

        self.assertIsNotNone(repo.saved)
        self.assertEqual(repo.saved.plan, PlanType.STANDARD)
        self.assertTrue(repo.saved.cancel_at_period_end)

    def test_logs_warning_when_plan_change_results_in_storage_over_quota(self):
        entity = _make_subscription(
            plan=PlanType.STANDARD,
            stripe_subscription_id="sub_existing",
            stripe_status="active",
            used_storage_bytes=15 * 1024 ** 3,
        )
        event = _make_event(
            "customer.subscription.updated",
            id="sub_existing",
            customer="cus_test",
            status="active",
            price_id="price_lite_001",
        )
        use_case = _make_use_case(entity, event)

        with self.assertLogs("app.use_cases.billing.handle_webhook", level=logging.WARNING) as captured:
            use_case.execute(payload=b"payload", sig_header="sig")

        self.assertIn("over quota", captured.output[0].lower())


class SubscriptionDeletedTests(TestCase):
    def test_subscription_deleted_reverts_to_free(self):
        entity = _make_subscription(
            plan=PlanType.LITE,
            stripe_subscription_id="sub_existing",
            stripe_status="active",
        )
        event = _make_event(
            "customer.subscription.deleted",
            id="sub_existing",
            customer="cus_test",
            status="canceled",
            cancel_at_period_end=False,
        )
        repo = _StubSubscriptionRepo(entity)
        use_case = HandleWebhookUseCase(
            subscription_repo=repo,
            billing_gateway=_StubBillingGateway(event),
            webhook_secret="whsec_test",
            price_map=PRICE_MAP,
        )
        use_case.execute(payload=b"payload", sig_header="sig")

        self.assertIsNotNone(repo.saved)
        self.assertEqual(repo.saved.plan, PlanType.FREE)
        self.assertEqual(repo.saved.stripe_status, "canceled")
        self.assertIsNone(repo.saved.stripe_subscription_id)


class UnknownEventTests(TestCase):
    def test_unknown_event_is_ignored(self):
        entity = _make_subscription(plan=PlanType.FREE)
        event = _make_event("payment_intent.succeeded", customer="cus_test")
        repo = _StubSubscriptionRepo(entity)
        use_case = HandleWebhookUseCase(
            subscription_repo=repo,
            billing_gateway=_StubBillingGateway(event),
            webhook_secret="whsec_test",
            price_map=PRICE_MAP,
        )
        use_case.execute(payload=b"payload", sig_header="sig")
        # No save should have been called
        self.assertIsNone(repo.saved)
