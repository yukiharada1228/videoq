"""
Infrastructure implementation of AccountDeletionGateway.
Handles persistence of deletion requests and user deactivation.
"""

import datetime

from django.utils import timezone

from app.domain.auth.gateways import AccountDeletionGateway
from app.models import AccountDeletionRequest


class DjangoAccountDeletionGateway(AccountDeletionGateway):
    """Implements AccountDeletionGateway using Django ORM."""

    def record_deletion_request(self, user_id: int, reason: str) -> None:
        from django.contrib.auth import get_user_model

        User = get_user_model()
        user = User.objects.get(pk=user_id)
        AccountDeletionRequest.objects.create(user=user, reason=reason)

    def deactivate_user(self, user, suffix: str) -> None:
        """Anonymize and deactivate the user account."""
        now = timezone.now()
        user.is_active = False
        user.deactivated_at = now
        user.username = f"deleted__{user.id}__{suffix}"
        user.email = f"deleted__{user.id}__{suffix}@invalid.local"
        user.save(update_fields=["is_active", "deactivated_at", "username", "email"])
