"""Unit tests for AccountDeletionUseCase."""

import contextlib
from typing import Optional
from unittest import TestCase
from unittest.mock import MagicMock

from app.domain.auth.gateways import AccountDeletionGateway, AuthTaskGateway
from app.domain.billing.entities import PlanType, SubscriptionEntity
from app.domain.billing.ports import BillingGateway, SubscriptionRepository
from app.domain.shared.transaction import TransactionPort
from app.use_cases.auth.delete_account import AccountDeletionUseCase


def _make_subscription(**kwargs) -> SubscriptionEntity:
    defaults = {
        "user_id": 1,
        "plan": PlanType.LITE,
        "stripe_customer_id": "cus_test",
        "stripe_subscription_id": "sub_test",
        "stripe_status": "active",
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


class _StubTransaction(TransactionPort):
    def atomic(self):
        return contextlib.nullcontext()

    def on_commit(self, fn):
        fn()


class _StubSubscriptionRepo(SubscriptionRepository):
    def __init__(self, entity: Optional[SubscriptionEntity]):
        self._entity = entity
        self.saved: Optional[SubscriptionEntity] = None

    def get_or_create(self, user_id: int) -> SubscriptionEntity:
        assert self._entity is not None
        return self._entity

    def get_by_user_id(self, user_id: int) -> Optional[SubscriptionEntity]:
        return self._entity

    def get_by_stripe_customer_id(self, customer_id: str) -> Optional[SubscriptionEntity]:
        return self._entity

    def save(self, entity: SubscriptionEntity) -> SubscriptionEntity:
        self._entity = entity
        self.saved = entity
        return entity

    def create_stripe_customer(self, user_id: int, customer_id: str) -> SubscriptionEntity:
        assert self._entity is not None
        return self._entity

    def reset_monthly_usage(self, user_id: int, period_start) -> None:
        pass

    def maybe_reset_monthly_usage(self, user_id: int) -> None:
        pass


class _StubBillingGateway(BillingGateway):
    def __init__(self):
        self.cancelled: list[str] = []

    def get_or_create_customer(self, user_id, email, username) -> str:
        return "cus_test"

    def create_checkout_session(self, customer_id, price_id, success_url, cancel_url, user_id, plan):
        raise NotImplementedError

    def update_subscription(self, subscription_id, price_id) -> None:
        raise NotImplementedError

    def create_billing_portal(self, customer_id, return_url):
        raise NotImplementedError

    def verify_webhook(self, payload, sig_header, secret):
        raise NotImplementedError

    def cancel_subscription(self, subscription_id: str) -> None:
        self.cancelled.append(subscription_id)


class AccountDeletionUseCaseTests(TestCase):
    def test_cancels_subscription_before_deactivation_and_enqueue(self):
        deletion_gateway = MagicMock(spec=AccountDeletionGateway)
        task_gateway = MagicMock(spec=AuthTaskGateway)
        billing_gateway = _StubBillingGateway()
        subscription_repo = _StubSubscriptionRepo(_make_subscription(stripe_subscription_id="sub_abc"))
        use_case = AccountDeletionUseCase(
            deletion_gateway=deletion_gateway,
            task_queue=task_gateway,
            tx=_StubTransaction(),
            subscription_repo=subscription_repo,
            billing_gateway=billing_gateway,
        )

        use_case.execute(user_id=1, reason="cleanup")

        self.assertEqual(billing_gateway.cancelled, ["sub_abc"])
        self.assertIsNotNone(subscription_repo.saved)
        self.assertEqual(subscription_repo.saved.plan, PlanType.FREE)
        self.assertIsNone(subscription_repo.saved.stripe_subscription_id)
        deletion_gateway.deactivate_user.assert_called_once()
        task_gateway.enqueue_account_deletion.assert_called_once_with(1)

    def test_does_not_deactivate_or_enqueue_when_subscription_cancel_fails(self):
        deletion_gateway = MagicMock(spec=AccountDeletionGateway)
        task_gateway = MagicMock(spec=AuthTaskGateway)
        billing_gateway = MagicMock(spec=BillingGateway)
        billing_gateway.cancel_subscription.side_effect = Exception("Stripe error")
        use_case = AccountDeletionUseCase(
            deletion_gateway=deletion_gateway,
            task_queue=task_gateway,
            tx=_StubTransaction(),
            subscription_repo=_StubSubscriptionRepo(_make_subscription(stripe_subscription_id="sub_fail")),
            billing_gateway=billing_gateway,
        )

        with self.assertRaises(Exception):
            use_case.execute(user_id=1, reason="")

        deletion_gateway.record_deletion_request.assert_not_called()
        deletion_gateway.deactivate_user.assert_not_called()
        task_gateway.enqueue_account_deletion.assert_not_called()

    def test_proceeds_normally_when_no_subscription_exists(self):
        deletion_gateway = MagicMock(spec=AccountDeletionGateway)
        task_gateway = MagicMock(spec=AuthTaskGateway)
        use_case = AccountDeletionUseCase(
            deletion_gateway=deletion_gateway,
            task_queue=task_gateway,
            tx=_StubTransaction(),
            subscription_repo=_StubSubscriptionRepo(None),
            billing_gateway=_StubBillingGateway(),
        )

        use_case.execute(user_id=1, reason="")

        deletion_gateway.record_deletion_request.assert_called_once_with(1, "")
        deletion_gateway.deactivate_user.assert_called_once()
        task_gateway.enqueue_account_deletion.assert_called_once_with(1)
