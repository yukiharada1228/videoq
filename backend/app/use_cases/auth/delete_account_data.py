"""
Use case: Delete all data associated with a user account (runs asynchronously).
"""

import logging
from typing import Optional

from app.domain.auth.gateways import UserDataDeletionGateway
from app.domain.billing.ports import BillingGateway, SubscriptionRepository

logger = logging.getLogger(__name__)


class DeleteAccountDataUseCase:
    """
    Orchestrates deletion of all user-owned data:
    1. Cancel Stripe subscription if active
    2. Delete all videos (including files)
    3. Delete chat history
    4. Delete video groups
    5. Delete tags
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
        self._cancel_subscription_if_active(user_id)
        self.gateway.delete_all_videos_for_user(user_id)
        self.gateway.delete_chat_history_for_user(user_id)
        self.gateway.delete_video_groups_for_user(user_id)
        self.gateway.delete_tags_for_user(user_id)
        logger.info("Account data deleted for user %s", user_id)

    def _cancel_subscription_if_active(self, user_id: int) -> None:
        if self._subscription_repo is None or self._billing_gateway is None:
            return
        entity = self._subscription_repo.get_by_user_id(user_id)
        if entity is None or not entity.stripe_subscription_id:
            return
        try:
            self._billing_gateway.cancel_subscription(entity.stripe_subscription_id)
            logger.info("Stripe subscription %s cancelled for user %s", entity.stripe_subscription_id, user_id)
        except Exception:
            logger.warning("Failed to cancel Stripe subscription for user %s", user_id, exc_info=True)
