from django.db import models


class ChatLogEvaluation(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    chat_log = models.OneToOneField(
        "ChatLog",
        on_delete=models.CASCADE,
        related_name="evaluation",
        db_index=True,
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    faithfulness = models.FloatField(null=True, blank=True)
    answer_relevancy = models.FloatField(null=True, blank=True)
    context_precision = models.FloatField(null=True, blank=True)
    error_message = models.TextField(default="", blank=True)
    evaluated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["status"]),
        ]
