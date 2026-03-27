"""
Use case: Deactivate a user account and enqueue data cleanup.
"""

import logging

from app.domain.auth.gateways import AccountDeletionGateway, AuthTaskGateway
from app.domain.shared.transaction import TransactionPort

logger = logging.getLogger(__name__)


class AccountDeletionUseCase:
    """
    Orchestrates account deletion:
    1. Record the deletion request
    2. Deactivate and anonymize the user
    3. Dispatch async data cleanup task (which handles data deletion and Stripe cancellation)
    """

    def __init__(
        self,
        deletion_gateway: AccountDeletionGateway,
        task_queue: AuthTaskGateway,
        tx: TransactionPort,
    ):
        self.deletion_gateway = deletion_gateway
        self.task_queue = task_queue
        self.tx = tx

    def execute(self, user_id: int, reason: str = "") -> None:
        with self.tx.atomic():
            self.deletion_gateway.record_deletion_request(user_id, reason)

            self.deletion_gateway.deactivate_user(user_id)
            self.task_queue.enqueue_account_deletion(user_id)

        logger.info("Account deletion initiated for user %s", user_id)
