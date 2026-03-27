"""
Use case: Delete all data associated with a user account (runs asynchronously).
"""

import logging
from typing import Optional

from app.domain.auth.gateways import UserDataDeletionGateway
from app.domain.billing.entities import PlanType
from app.domain.billing.ports import BillingGateway, SubscriptionRepository

logger = logging.getLogger(__name__)


class DeleteAccountDataUseCase:
    """
    Orchestrates deletion of all user-owned data:
    1. Delete all videos (including R2 files)
    2. Delete chat history
    3. Delete video groups
    4. Delete tags
    5. Cancel Stripe subscription (after data is deleted)
    """

    def __init__(
        self,
        user_data_deletion_gateway: UserDataDeletionGateway,
        subscription_repo: Optional[SubscriptionRepository] = None,
        billing_gateway: Optional[BillingGateway] = None,
    ):
        self.gateway = user_data_deletion_gateway
        self._subscription_repo = subscription_repo
        self._billing_gateway = billing_gateway

    def execute(self, user_id: int) -> None:
        data_steps = [
            ("delete_all_videos_for_user", self.gateway.delete_all_videos_for_user),
            ("delete_chat_history_for_user", self.gateway.delete_chat_history_for_user),
            ("delete_video_groups_for_user", self.gateway.delete_video_groups_for_user),
            ("delete_tags_for_user", self.gateway.delete_tags_for_user),
        ]
        for step_name, step in data_steps:
            try:
                step(user_id)
            except Exception:
                logger.error(
                    "Account deletion step %s failed for user %s",
                    step_name,
                    user_id,
                    exc_info=True,
                )
        self._cancel_subscription_if_active(user_id)
        logger.info("Account data deletion completed for user %s", user_id)

    def _cancel_subscription_if_active(self, user_id: int) -> None:
        if self._subscription_repo is None or self._billing_gateway is None:
            return
        entity = self._subscription_repo.get_by_user_id(user_id)
        if entity is None or not entity.stripe_subscription_id:
            return
        subscription_id = entity.stripe_subscription_id
        self._billing_gateway.cancel_subscription(subscription_id)
        entity.plan = PlanType.FREE
        entity.stripe_subscription_id = None
        entity.stripe_status = "canceled"
        entity.cancel_at_period_end = False
        entity.current_period_end = None
        self._subscription_repo.save(entity)
        logger.info("Stripe subscription %s cancelled for user %s", subscription_id, user_id)
