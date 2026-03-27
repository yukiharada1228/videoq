"""Unit tests for CreateCheckoutSessionUseCase."""

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
from app.use_cases.billing.create_checkout_session import CreateCheckoutSessionUseCase
from app.use_cases.billing.exceptions import (
    BillingNotEnabled,
    DowngradeNotAllowed,
    InvalidPlan,
)


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

    def get_or_create(self, user_id: int) -> SubscriptionEntity:
        return self._entity

    def get_by_user_id(self, user_id: int) -> Optional[SubscriptionEntity]:
        return self._entity

    def get_by_stripe_customer_id(self, customer_id: str) -> Optional[SubscriptionEntity]:
        return None

    def save(self, entity: SubscriptionEntity) -> SubscriptionEntity:
        self._entity = entity
        self.saved = entity
        return entity

    def create_stripe_customer(self, user_id: int, customer_id: str) -> SubscriptionEntity:
        self._entity.stripe_customer_id = customer_id
        return self._entity

    def reset_monthly_usage(self, user_id: int, period_start) -> None:
        pass

    def maybe_reset_monthly_usage(self, user_id: int) -> None:
        pass

    def increment_storage_bytes(self, user_id: int, bytes_delta: int) -> None:
        pass

    def increment_processing_seconds(self, user_id: int, seconds: int) -> None:
        pass

    def increment_ai_answers(self, user_id: int) -> None:
        pass


class _StubBillingGateway(BillingGateway):
    def __init__(self, customer_id: str = "cus_test", checkout_url: str = "https://checkout.test"):
        self._customer_id = customer_id
        self._checkout_url = checkout_url
        self.last_price_id = None
        self.updated_subscription_id = None
        self.update_error: Optional[Exception] = None
        self.checkout_calls = 0

    def get_or_create_customer(self, user_id, email, username) -> str:
        return self._customer_id

    def create_checkout_session(self, customer_id, price_id, success_url, cancel_url, user_id, plan):
        self.last_price_id = price_id
        self.checkout_calls += 1
        session = MagicMock()
        session.url = self._checkout_url
        return session

    def update_subscription(self, subscription_id, price_id) -> None:
        self.updated_subscription_id = subscription_id
        self.last_price_id = price_id
        if self.update_error is not None:
            raise self.update_error

    def create_billing_portal(self, customer_id, return_url):
        portal = MagicMock()
        portal.url = "https://portal.test"
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


class _StubUserRepo:
    def get_by_id(self, user_id: int):
        user = MagicMock()
        user.email = "test@example.com"
        user.username = "testuser"
        return user


def _make_use_case(
    entity: SubscriptionEntity,
    billing_enabled: bool = True,
    price_map: Optional[dict] = None,
    gateway: Optional[_StubBillingGateway] = None,
) -> CreateCheckoutSessionUseCase:
    if price_map is None:
        price_map = {
            PlanType.LITE: {"jpy": "price_lite_jpy_001", "usd": "price_lite_usd_001"},
            PlanType.STANDARD: {"jpy": "price_standard_jpy_001", "usd": "price_standard_usd_001"},
        }
    if gateway is None:
        gateway = _StubBillingGateway()
    return CreateCheckoutSessionUseCase(
        subscription_repo=_StubSubscriptionRepo(entity),
        billing_gateway=gateway,
        billing_enabled=billing_enabled,
        price_map=price_map,
        user_repo=_StubUserRepo(),
    )


class BillingNotEnabledTests(TestCase):
    def test_raises_billing_not_enabled(self):
        entity = _make_subscription()
        use_case = _make_use_case(entity, billing_enabled=False)
        with self.assertRaises(BillingNotEnabled):
            use_case.execute(
                user_id=1,
                plan="lite",
                success_url="https://success",
                cancel_url="https://cancel",
            )


class ValidPlanTests(TestCase):
    def test_creates_checkout_session_for_lite_jpy(self):
        entity = _make_subscription()
        use_case = _make_use_case(entity)
        dto = use_case.execute(
            user_id=1,
            plan="lite",
            success_url="https://success",
            cancel_url="https://cancel",
            currency="jpy",
        )
        self.assertEqual(dto.checkout_url, "https://checkout.test")

    def test_creates_checkout_session_for_standard_jpy(self):
        entity = _make_subscription()
        use_case = _make_use_case(entity)
        dto = use_case.execute(
            user_id=1,
            plan="standard",
            success_url="https://success",
            cancel_url="https://cancel",
            currency="jpy",
        )
        self.assertEqual(dto.checkout_url, "https://checkout.test")

    def test_creates_checkout_session_for_lite_usd(self):
        entity = _make_subscription()
        gateway = _StubBillingGateway()
        use_case = _make_use_case(entity, gateway=gateway)
        dto = use_case.execute(
            user_id=1,
            plan="lite",
            success_url="https://success",
            cancel_url="https://cancel",
            currency="usd",
        )
        self.assertEqual(dto.checkout_url, "https://checkout.test")
        self.assertEqual(gateway.last_price_id, "price_lite_usd_001")

    def test_creates_checkout_session_for_standard_usd(self):
        entity = _make_subscription()
        gateway = _StubBillingGateway()
        use_case = _make_use_case(entity, gateway=gateway)
        dto = use_case.execute(
            user_id=1,
            plan="standard",
            success_url="https://success",
            cancel_url="https://cancel",
            currency="usd",
        )
        self.assertEqual(dto.checkout_url, "https://checkout.test")
        self.assertEqual(gateway.last_price_id, "price_standard_usd_001")

    def test_currency_defaults_to_jpy(self):
        entity = _make_subscription()
        gateway = _StubBillingGateway()
        use_case = _make_use_case(entity, gateway=gateway)
        dto = use_case.execute(
            user_id=1,
            plan="lite",
            success_url="https://success",
            cancel_url="https://cancel",
        )
        self.assertEqual(dto.checkout_url, "https://checkout.test")
        self.assertEqual(gateway.last_price_id, "price_lite_jpy_001")

    def test_currency_is_case_insensitive(self):
        entity = _make_subscription()
        gateway = _StubBillingGateway()
        use_case = _make_use_case(entity, gateway=gateway)
        dto = use_case.execute(
            user_id=1,
            plan="lite",
            success_url="https://success",
            cancel_url="https://cancel",
            currency="USD",
        )
        self.assertEqual(dto.checkout_url, "https://checkout.test")
        self.assertEqual(gateway.last_price_id, "price_lite_usd_001")


class AlreadySubscribedTests(TestCase):
    def test_upgrades_in_place_when_active_paid_subscription_exists(self):
        entity = _make_subscription(
            plan=PlanType.LITE,
            stripe_status="active",
            stripe_subscription_id="sub_existing",
            stripe_customer_id="cus_existing",
        )
        gateway = _StubBillingGateway()
        use_case = _make_use_case(entity, gateway=gateway)
        dto = use_case.execute(
            user_id=1,
            plan="standard",
            success_url="https://success",
            cancel_url="https://cancel",
        )
        self.assertTrue(dto.upgraded)
        self.assertEqual(dto.checkout_url, "")

    def test_falls_back_to_checkout_when_stripe_rejects_subscription_update(self):
        entity = _make_subscription(
            plan=PlanType.LITE,
            stripe_status="active",
            stripe_subscription_id="sub_canceled",
            stripe_customer_id="cus_existing",
        )
        gateway = _StubBillingGateway()
        gateway.update_error = Exception(
            "A canceled subscription can only update its cancellation_details and metadata."
        )
        use_case = _make_use_case(entity, gateway=gateway)

        dto = use_case.execute(
            user_id=1,
            plan="standard",
            success_url="https://success",
            cancel_url="https://cancel",
        )

        self.assertFalse(dto.upgraded)
        self.assertEqual(dto.checkout_url, "https://checkout.test")
        self.assertEqual(gateway.updated_subscription_id, "sub_canceled")
        self.assertEqual(gateway.checkout_calls, 1)
        self.assertIsNotNone(use_case._subscription_repo.saved)
        self.assertEqual(use_case._subscription_repo.saved.plan, PlanType.FREE)
        self.assertIsNone(use_case._subscription_repo.saved.stripe_subscription_id)
        self.assertEqual(use_case._subscription_repo.saved.stripe_status, "canceled")


class DowngradeGuardTests(TestCase):
    def test_blocks_downgrade_when_used_storage_exceeds_target_limit(self):
        entity = _make_subscription(
            plan=PlanType.STANDARD,
            stripe_status="active",
            stripe_subscription_id="sub_existing",
            stripe_customer_id="cus_existing",
            used_storage_bytes=15 * 1024 ** 3,
        )
        use_case = _make_use_case(entity)

        with self.assertRaises(DowngradeNotAllowed) as ctx:
            use_case.execute(
                user_id=1,
                plan="lite",
                success_url="https://success",
                cancel_url="https://cancel",
            )

        self.assertEqual(ctx.exception.used_storage_bytes, 15 * 1024 ** 3)
        self.assertEqual(ctx.exception.target_limit_bytes, 10 * 1024 ** 3)
        self.assertEqual(ctx.exception.over_quota_bytes, 5 * 1024 ** 3)

    def test_allows_upgrade_when_target_limit_is_higher_than_current_plan(self):
        entity = _make_subscription(
            plan=PlanType.FREE,
            used_storage_bytes=5 * 1024 ** 3,
        )
        use_case = _make_use_case(entity)

        dto = use_case.execute(
            user_id=1,
            plan="lite",
            success_url="https://success",
            cancel_url="https://cancel",
        )

        self.assertEqual(dto.checkout_url, "https://checkout.test")


class InvalidPlanTests(TestCase):
    def test_enterprise_plan_raises_invalid_plan(self):
        entity = _make_subscription()
        use_case = _make_use_case(entity)
        with self.assertRaises(InvalidPlan):
            use_case.execute(
                user_id=1,
                plan="enterprise",
                success_url="https://success",
                cancel_url="https://cancel",
            )

    def test_free_plan_raises_invalid_plan(self):
        entity = _make_subscription()
        use_case = _make_use_case(entity)
        with self.assertRaises(InvalidPlan):
            use_case.execute(
                user_id=1,
                plan="free",
                success_url="https://success",
                cancel_url="https://cancel",
            )

    def test_unknown_plan_raises_invalid_plan(self):
        entity = _make_subscription()
        use_case = _make_use_case(entity)
        with self.assertRaises(InvalidPlan):
            use_case.execute(
                user_id=1,
                plan="super_premium",
                success_url="https://success",
                cancel_url="https://cancel",
            )

    def test_invalid_currency_raises_invalid_plan(self):
        entity = _make_subscription()
        use_case = _make_use_case(entity)
        with self.assertRaises(InvalidPlan):
            use_case.execute(
                user_id=1,
                plan="lite",
                success_url="https://success",
                cancel_url="https://cancel",
                currency="eur",
            )
