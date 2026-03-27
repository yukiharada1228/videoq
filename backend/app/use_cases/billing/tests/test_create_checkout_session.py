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

    def clear_stripe_customer(self, user_id: int) -> None:
        self._entity.stripe_customer_id = None

    def get_or_create_stripe_customer(self, user_id: int, create_fn, replace_if_stale=None) -> tuple:
        if not self._entity.stripe_customer_id or self._entity.stripe_customer_id == replace_if_stale:
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


class _StubBillingGateway(BillingGateway):
    def __init__(self, customer_id: str = "cus_test", checkout_url: str = "https://checkout.test"):
        self._customer_id = customer_id
        self._checkout_url = checkout_url
        self.last_price_id = None
        self.updated_subscription_id = None
        self.update_error: Optional[Exception] = None
        self.checkout_calls = 0
        self.checkout_error: Optional[Exception] = None

    def get_or_create_customer(self, user_id, email, username) -> str:
        return self._customer_id

    def create_checkout_session(self, customer_id, price_id, success_url, cancel_url, user_id, plan):
        self.last_price_id = price_id
        self.checkout_calls += 1
        if self.checkout_error is not None and self.checkout_calls == 1:
            raise self.checkout_error
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


class PendingCancellationTests(TestCase):
    def test_updates_subscription_in_place_when_pending_cancellation(self):
        """A subscription with cancel_at_period_end=True should be updated in place, not recreated."""
        entity = _make_subscription(
            plan=PlanType.LITE,
            stripe_status="active",
            stripe_subscription_id="sub_pending",
            stripe_customer_id="cus_existing",
            cancel_at_period_end=True,
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
        self.assertEqual(gateway.updated_subscription_id, "sub_pending")


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


class DowngradeTests(TestCase):
    def test_allows_downgrade_even_when_used_storage_exceeds_target_limit(self):
        """Downgrade is always allowed; is_over_quota handles enforcement post-downgrade."""
        entity = _make_subscription(
            plan=PlanType.STANDARD,
            stripe_status="active",
            stripe_subscription_id="sub_existing",
            stripe_customer_id="cus_existing",
            used_storage_bytes=15 * 1024 ** 3,
        )
        use_case = _make_use_case(entity)

        # Should not raise DowngradeNotAllowed
        dto = use_case.execute(
            user_id=1,
            plan="lite",
            success_url="https://success",
            cancel_url="https://cancel",
        )

        self.assertTrue(dto.upgraded)

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


class CustomerCreationAtomicityTests(TestCase):
    """Verify that Stripe customer creation is delegated atomically to the repository.

    The use case must call subscription_repo.get_or_create_stripe_customer() instead of
    manually checking stripe_customer_id and calling billing_gateway.get_or_create_customer()
    directly. This prevents duplicate Stripe customer creation under concurrent requests
    because the repository implementation uses select_for_update to ensure only one caller
    creates the customer.
    """

    def test_create_fn_not_called_when_stripe_customer_already_set(self):
        """If the repo already has a stripe_customer_id, the billing gateway must NOT be called."""
        entity = _make_subscription(stripe_customer_id="cus_existing")
        gateway = _StubBillingGateway()
        create_customer_calls = []
        original_get_or_create = gateway.get_or_create_customer

        def tracking_get_or_create(*args, **kwargs):
            create_customer_calls.append(True)
            return original_get_or_create(*args, **kwargs)

        gateway.get_or_create_customer = tracking_get_or_create
        use_case = _make_use_case(entity, gateway=gateway)
        use_case.execute(
            user_id=1,
            plan="lite",
            success_url="https://success",
            cancel_url="https://cancel",
        )
        self.assertEqual(len(create_customer_calls), 0)

    def test_create_fn_called_once_when_stripe_customer_is_none(self):
        """When no stripe_customer_id exists, billing gateway must be called exactly once."""
        entity = _make_subscription(stripe_customer_id=None)
        gateway = _StubBillingGateway(customer_id="cus_new")
        create_customer_calls = []
        original_get_or_create = gateway.get_or_create_customer

        def tracking_get_or_create(*args, **kwargs):
            create_customer_calls.append(True)
            return original_get_or_create(*args, **kwargs)

        gateway.get_or_create_customer = tracking_get_or_create
        use_case = _make_use_case(entity, gateway=gateway)
        use_case.execute(
            user_id=1,
            plan="lite",
            success_url="https://success",
            cancel_url="https://cancel",
        )
        self.assertEqual(len(create_customer_calls), 1)

    def test_concurrent_request_skips_create_fn_when_repo_finds_existing_customer(self):
        """Simulate a race condition: a second concurrent request finds the customer already set.

        The stub's get_or_create_stripe_customer is replaced with one that simulates the
        database lock revealing an already-set customer ID (set by a first concurrent request).
        In this case, create_fn must NOT be called.
        """
        entity = _make_subscription(stripe_customer_id=None)
        gateway = _StubBillingGateway(customer_id="cus_race_winner")
        create_customer_calls = []

        class _RaceSimulatingRepo(_StubSubscriptionRepo):
            """Simulates a second concurrent request: by the time the lock is acquired,
            another request has already set the stripe_customer_id."""

            def get_or_create_stripe_customer(self, user_id, create_fn):
                # Simulate: locked row already has a customer_id set by another thread
                self._entity.stripe_customer_id = "cus_set_by_other_thread"
                # Should NOT call create_fn
                return self._entity.stripe_customer_id, self._entity

        from app.use_cases.billing.create_checkout_session import CreateCheckoutSessionUseCase

        repo = _RaceSimulatingRepo(entity)
        use_case = CreateCheckoutSessionUseCase(
            subscription_repo=repo,
            billing_gateway=gateway,
            billing_enabled=True,
            price_map={
                PlanType.LITE: {"jpy": "price_lite_jpy_001"},
            },
            user_repo=_StubUserRepo(),
        )
        original_get_or_create = gateway.get_or_create_customer

        def tracking_get_or_create(*args, **kwargs):
            create_customer_calls.append(True)
            return original_get_or_create(*args, **kwargs)

        gateway.get_or_create_customer = tracking_get_or_create
        use_case.execute(
            user_id=1,
            plan="lite",
            success_url="https://success",
            cancel_url="https://cancel",
            currency="jpy",
        )
        self.assertEqual(len(create_customer_calls), 0)

    def test_stale_customer_recovery_uses_atomic_repo_method(self):
        """When Stripe returns 'No such customer', recovery must go through the atomic repo method.

        The stale customer ID is cleared (set to None) so get_or_create_stripe_customer
        will invoke create_fn once under the row lock, preventing duplicates.
        """
        entity = _make_subscription(stripe_customer_id="cus_stale")
        gateway = _StubBillingGateway(customer_id="cus_recreated")
        gateway.checkout_error = Exception("No such customer: 'cus_stale'")

        create_customer_calls = []
        original_get_or_create = gateway.get_or_create_customer

        def tracking_get_or_create(*args, **kwargs):
            create_customer_calls.append(True)
            return original_get_or_create(*args, **kwargs)

        gateway.get_or_create_customer = tracking_get_or_create
        use_case = _make_use_case(entity, gateway=gateway)
        dto = use_case.execute(
            user_id=1,
            plan="lite",
            success_url="https://success",
            cancel_url="https://cancel",
        )
        # Recovery creates a new customer exactly once via the atomic repo method
        self.assertEqual(len(create_customer_calls), 1)
        self.assertEqual(dto.checkout_url, "https://checkout.test")

    def test_recovery_does_not_call_clear_stripe_customer(self):
        """Recovery must NOT call clear_stripe_customer — it creates a race window.

        Between clear_stripe_customer (unlocked) and get_or_create_stripe_customer
        (locked), a concurrent thread can clear the newly created customer ID.
        Instead, recovery must use a single get_or_create_stripe_customer(replace_if_stale=...)
        call which does the clear-and-recreate atomically under the row lock.
        """
        entity = _make_subscription(stripe_customer_id="cus_stale")
        gateway = _StubBillingGateway(customer_id="cus_recreated")
        gateway.checkout_error = Exception("No such customer: 'cus_stale'")

        class _TrackingRepo(_StubSubscriptionRepo):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.clear_stripe_customer_called = False

            def clear_stripe_customer(self, user_id: int) -> None:
                self.clear_stripe_customer_called = True
                super().clear_stripe_customer(user_id)

        repo = _TrackingRepo(entity)
        use_case = CreateCheckoutSessionUseCase(
            subscription_repo=repo,
            billing_gateway=gateway,
            billing_enabled=True,
            price_map={PlanType.LITE: {"jpy": "price_lite_jpy_001"}},
            user_repo=_StubUserRepo(),
        )
        use_case.execute(
            user_id=1,
            plan="lite",
            success_url="https://success",
            cancel_url="https://cancel",
            currency="jpy",
        )
        self.assertFalse(
            repo.clear_stripe_customer_called,
            "clear_stripe_customer must not be called during 'No such customer' recovery "
            "because it creates an unlocked gap where concurrent threads can delete a "
            "freshly created customer.",
        )



class CasRecoveryTests(TestCase):
    """Compare-and-Swap recovery: replace_if_stale でのみ再作成し、
    別スレッドが先に作った新顧客があればそれを再利用する。"""

    def test_recovery_passes_stale_id_as_replace_if_stale(self):
        """リカバリ時は検出した stale な customer_id を replace_if_stale に渡す。

        force_recreate=True（常に再作成）より意味が明確で、
        別スレッドがすでに新顧客を作っていた場合に再利用できる。
        """
        entity = _make_subscription(stripe_customer_id="cus_stale")
        gateway = _StubBillingGateway(customer_id="cus_recreated")
        gateway.checkout_error = Exception("No such customer: 'cus_stale'")

        class _TrackingRepo(_StubSubscriptionRepo):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.replace_if_stale_values: list = []

            def get_or_create_stripe_customer(self, user_id, create_fn, replace_if_stale=None):
                self.replace_if_stale_values.append(replace_if_stale)
                return super().get_or_create_stripe_customer(
                    user_id, create_fn, replace_if_stale=replace_if_stale
                )

        repo = _TrackingRepo(entity)
        use_case = CreateCheckoutSessionUseCase(
            subscription_repo=repo,
            billing_gateway=gateway,
            billing_enabled=True,
            price_map={PlanType.LITE: {"jpy": "price_lite_jpy_001"}},
            user_repo=_StubUserRepo(),
        )
        use_case.execute(
            user_id=1,
            plan="lite",
            success_url="https://success",
            cancel_url="https://cancel",
            currency="jpy",
        )
        # 通常パス: replace_if_stale=None
        # リカバリパス: replace_if_stale="cus_stale"（検出した stale ID）
        self.assertEqual(len(repo.replace_if_stale_values), 2)
        self.assertIsNone(repo.replace_if_stale_values[0])
        self.assertEqual(
            repo.replace_if_stale_values[1],
            "cus_stale",
            "リカバリ時は検出した stale な customer_id を replace_if_stale に渡すべき。"
            "これにより repo はロック内で『DBの値 == stale ID なら再作成、"
            "違うなら別スレッドが作った新顧客を再利用』という CAS を実行できる。",
        )

    def test_concurrent_recovery_reuses_other_thread_customer_without_calling_create_fn(self):
        """Thread A がロック内で cus_new_A を作成済みのとき、Thread B は create_fn を呼ばずに再利用する。

        CAS の核心: replace_if_stale="cus_stale" を持つ Thread B がロックを取得したとき、
        DB の値が "cus_new_A"（stale ID と不一致）であれば別スレッドが作った有効な顧客と判断し、
        Stripe API を呼ばずにその ID を返す。force_recreate=True では常に再作成していたので
        orphan 顧客が生まれていたが、CAS ではそれが起きない。
        """
        entity = _make_subscription(stripe_customer_id="cus_stale")
        gateway = _StubBillingGateway(customer_id="cus_new_from_thread_b")
        gateway.checkout_error = Exception("No such customer: 'cus_stale'")

        create_fn_calls = []

        class _CasSimulatingRepo(_StubSubscriptionRepo):
            """リカバリ時に Thread A がすでに cus_new_A を commit 済みな状況をシミュレート。
            replace_if_stale="cus_stale" かつ DB 値が "cus_new_A" → create_fn を呼ばずに再利用。"""
            _first_call_done = False

            def get_or_create_stripe_customer(self, user_id, create_fn, replace_if_stale=None):
                if not self._first_call_done:
                    self._first_call_done = True
                    return self._entity.stripe_customer_id, self._entity
                # リカバリ呼び出し: Thread A がすでに cus_new_A を保存済み
                self._entity.stripe_customer_id = "cus_new_A"
                # CAS: DB値 "cus_new_A" != replace_if_stale "cus_stale" → 再利用すべき
                if self._entity.stripe_customer_id != replace_if_stale:
                    return self._entity.stripe_customer_id, self._entity
                create_fn_calls.append(True)
                self._entity.stripe_customer_id = create_fn()
                return self._entity.stripe_customer_id, self._entity

        repo = _CasSimulatingRepo(entity)
        original_get_or_create = gateway.get_or_create_customer

        def tracking_get_or_create(*args, **kwargs):
            create_fn_calls.append(True)
            return original_get_or_create(*args, **kwargs)

        gateway.get_or_create_customer = tracking_get_or_create
        use_case = CreateCheckoutSessionUseCase(
            subscription_repo=repo,
            billing_gateway=gateway,
            billing_enabled=True,
            price_map={PlanType.LITE: {"jpy": "price_lite_jpy_001"}},
            user_repo=_StubUserRepo(),
        )
        dto = use_case.execute(
            user_id=1,
            plan="lite",
            success_url="https://success",
            cancel_url="https://cancel",
            currency="jpy",
        )
        self.assertEqual(dto.checkout_url, "https://checkout.test")
        self.assertEqual(
            len(create_fn_calls),
            0,
            "Thread A がすでに新顧客を作っていた場合、Thread B は Stripe API を呼ばずに再利用すべき。"
            "create_fn が呼ばれると orphan 顧客が Stripe 上に生まれる。",
        )
