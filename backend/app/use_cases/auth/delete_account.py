"""
Use case: Deactivate a user account and enqueue data cleanup.
"""

import datetime
import logging

from app.domain.auth.gateways import AccountDeletionGateway, TaskQueueGateway

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
        task_queue: TaskQueueGateway,
    ):
        self.deletion_gateway = deletion_gateway
        self.task_queue = task_queue

    def execute(self, user, reason: str = "") -> None:
        self.deletion_gateway.record_deletion_request(user.id, reason)

        suffix = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")
        self.deletion_gateway.deactivate_user(user, suffix)

        self.task_queue.enqueue_account_deletion(user.id)
        logger.info("Account deletion initiated for user %s", user.id)
