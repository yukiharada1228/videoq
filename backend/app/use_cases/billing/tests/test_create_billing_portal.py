"""Unit tests for CreateBillingPortalUseCase."""

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
from app.use_cases.billing.create_billing_portal import CreateBillingPortalUseCase
from app.use_cases.billing.exceptions import (
    BillingNotEnabled,
    InvalidReturnUrl,
    NoStripeCustomer,
)


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


class _StubBillingGateway(BillingGateway):
    def __init__(self, portal_url: str = "https://billing.stripe.com/portal_test"):
        self._portal_url = portal_url

    def get_or_create_customer(self, user_id, email, username) -> str:
        return "cus_test"

    def create_checkout_session(self, customer_id, price_id, success_url, cancel_url, user_id, plan):
        session = MagicMock()
        session.url = "https://checkout.test"
        return session

    def update_subscription(self, subscription_id, price_id) -> None:
        pass

    def create_billing_portal(self, customer_id, return_url):
        portal = MagicMock()
        portal.url = self._portal_url
        return portal

    def verify_webhook(self, payload, sig_header, secret) -> WebhookEvent:
        return WebhookEvent(
            type="",
            data_object=SubscriptionEventData(
                id="",
                customer="",
                status="",
                cancel_at_period_end=False,
                current_period_end=None,
                price_id=None,
            ),
        )

    def cancel_subscription(self, subscription_id: str) -> None:
        pass


_DEFAULT_ALLOWED_ORIGINS = ["https://app.example.com"]


def _make_use_case(
    entity: Optional[SubscriptionEntity] = None,
    billing_enabled: bool = True,
    gateway: Optional[_StubBillingGateway] = None,
    allowed_origins: Optional[list] = None,
) -> CreateBillingPortalUseCase:
    if entity is None:
        entity = _make_subscription()
    if gateway is None:
        gateway = _StubBillingGateway()
    if allowed_origins is None:
        allowed_origins = _DEFAULT_ALLOWED_ORIGINS
    return CreateBillingPortalUseCase(
        subscription_repo=_StubSubscriptionRepo(entity),
        billing_gateway=gateway,
        billing_enabled=billing_enabled,
        allowed_origins=allowed_origins,
    )


class BillingNotEnabledTests(TestCase):
    def test_raises_billing_not_enabled(self):
        use_case = _make_use_case(billing_enabled=False)
        with self.assertRaises(BillingNotEnabled):
            use_case.execute(user_id=1, return_url="https://app.example.com/billing")


class NoStripeCustomerTests(TestCase):
    def test_raises_no_stripe_customer_when_customer_id_missing(self):
        entity = _make_subscription(stripe_customer_id=None)
        use_case = _make_use_case(entity=entity)
        with self.assertRaises(NoStripeCustomer):
            use_case.execute(user_id=1, return_url="https://app.example.com/billing")


class PortalCreationTests(TestCase):
    def test_returns_portal_url(self):
        use_case = _make_use_case()
        dto = use_case.execute(user_id=1, return_url="https://app.example.com/billing")
        self.assertEqual(dto.portal_url, "https://billing.stripe.com/portal_test")


class ReturnUrlAllowlistTests(TestCase):
    def test_raises_invalid_return_url_when_not_in_allowlist(self):
        use_case = _make_use_case(allowed_origins=["https://app.example.com"])
        with self.assertRaises(InvalidReturnUrl):
            use_case.execute(user_id=1, return_url="https://evil.example.com/billing")

    def test_allowed_return_url_passes_validation(self):
        use_case = _make_use_case(allowed_origins=["https://app.example.com"])
        dto = use_case.execute(user_id=1, return_url="https://app.example.com/billing")
        self.assertEqual(dto.portal_url, "https://billing.stripe.com/portal_test")

    def test_multiple_allowed_origins_accepts_any(self):
        use_case = _make_use_case(
            allowed_origins=["https://app.example.com", "https://www.example.com"]
        )
        dto = use_case.execute(user_id=1, return_url="https://www.example.com/billing")
        self.assertEqual(dto.portal_url, "https://billing.stripe.com/portal_test")

    def test_raises_invalid_return_url_when_allowed_origins_is_empty(self):
        use_case = _make_use_case(allowed_origins=[])
        with self.assertRaises(InvalidReturnUrl):
            use_case.execute(user_id=1, return_url="https://app.example.com/billing")
