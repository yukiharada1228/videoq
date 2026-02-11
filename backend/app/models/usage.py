from django.conf import settings
from django.db import models


class UsageRecord(models.Model):
    """Immutable log of resource consumption, independent of video deletion."""

    RESOURCE_CHOICES = [
        ("processing_minutes", "Processing Minutes"),
        ("ai_answers", "AI Answers"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="usage_records",
        db_index=True,
    )
    resource = models.CharField(max_length=30, choices=RESOURCE_CHOICES, db_index=True)
    amount = models.FloatField(help_text="Amount consumed (e.g. minutes)")
    video = models.ForeignKey(
        "Video",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="Source video (nullable after deletion)",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "resource", "created_at"]),
        ]

    def __str__(self):
        return f"{self.user_id} {self.resource} {self.amount}"
