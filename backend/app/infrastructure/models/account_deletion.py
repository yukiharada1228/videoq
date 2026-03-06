from django.conf import settings
from django.db import models


class AccountDeletionRequest(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="account_deletion_requests",
        db_index=True,
    )
    reason = models.TextField(blank=True)
    requested_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-requested_at"]
        indexes = [
            models.Index(fields=["user", "-requested_at"]),
        ]

    def __str__(self):
        return f"AccountDeletionRequest(user_id={self.user_id})"
