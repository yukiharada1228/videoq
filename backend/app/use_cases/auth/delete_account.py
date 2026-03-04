"""
Use case: Deactivate a user account and enqueue data cleanup.
"""

import logging

from django.utils import timezone

from app.models import AccountDeletionRequest

logger = logging.getLogger(__name__)


class AccountDeletionUseCase:
    """
    Orchestrates account deletion:
    1. Record the deletion request
    2. Deactivate and anonymize the user
    3. Dispatch async data cleanup task
    """

    def execute(self, user, reason: str = "") -> None:
        AccountDeletionRequest.objects.create(user=user, reason=reason)

        now = timezone.now()
        suffix = now.strftime("%Y%m%d%H%M%S")
        user.is_active = False
        user.deactivated_at = now
        user.username = f"deleted__{user.id}__{suffix}"
        user.email = f"deleted__{user.id}__{suffix}@invalid.local"
        user.save(update_fields=["is_active", "deactivated_at", "username", "email"])

        from app.tasks.account_deletion import delete_account_data

        delete_account_data.delay(user.id)
        logger.info("Account deletion initiated for user %s", user.id)
