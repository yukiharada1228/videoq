"""
Use case: Deactivate a user account and enqueue data cleanup.
"""

import datetime
import logging
from typing import Optional

from app.domain.auth.gateways import AccountDeletionGateway, AuthTaskGateway
from app.domain.billing.entities import PlanType
from app.domain.billing.ports import BillingGateway, SubscriptionRepository
from app.domain.shared.transaction import TransactionPort

logger = logging.getLogger(__name__)


class AccountDeletionUseCase:
    """
    Orchestrates account deletion:
    1. Record the deletion request
    2. Deactivate and anonymize the user
    3. Dispatch async data cleanup task
    """

    def __init__(
        self,
        deletion_gateway: AccountDeletionGateway,
        task_queue: AuthTaskGateway,
        tx: TransactionPort,
        subscription_repo: Optional[SubscriptionRepository] = None,
        billing_gateway: Optional[BillingGateway] = None,
    ):
        self.deletion_gateway = deletion_gateway
        self.task_queue = task_queue
        self.tx = tx
        self._subscription_repo = subscription_repo
        self._billing_gateway = billing_gateway

    def execute(self, user_id: int, reason: str = "") -> None:
        self._cancel_subscription_if_active(user_id)

        with self.tx.atomic():
            self.deletion_gateway.record_deletion_request(user_id, reason)

            suffix = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")
            self.deletion_gateway.deactivate_user(user_id, suffix)
            self.task_queue.enqueue_account_deletion(user_id)

        logger.info("Account deletion initiated for user %s", user_id)

    def _cancel_subscription_if_active(self, user_id: int) -> None:
        if self._subscription_repo is None or self._billing_gateway is None:
            return

        entity = self._subscription_repo.get_by_user_id(user_id)
        if entity is None or not entity.stripe_subscription_id:
            return

        self._billing_gateway.cancel_subscription(entity.stripe_subscription_id)
        entity.plan = PlanType.FREE
        entity.stripe_subscription_id = None
        entity.stripe_status = "canceled"
        entity.cancel_at_period_end = False
        entity.current_period_end = None
        self._subscription_repo.save(entity)
        logger.info("Stripe subscription cancelled before account deletion for user %s", user_id)
