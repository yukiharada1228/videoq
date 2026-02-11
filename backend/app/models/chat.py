from django.conf import settings
from django.db import models


class ChatLog(models.Model):
    class FeedbackChoices(models.TextChoices):
        GOOD = "good", "Good"
        BAD = "bad", "Bad"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_logs",
        db_index=True,
    )
    group = models.ForeignKey(
        "VideoGroup",
        on_delete=models.CASCADE,
        related_name="chat_logs",
        db_index=True,
        null=True,
        blank=True,
    )
    question = models.TextField()
    answer = models.TextField()
    related_videos = models.JSONField(default=list, blank=True)
    is_shared_origin = models.BooleanField(default=False, db_index=True)
    feedback = models.CharField(
        max_length=4,
        choices=FeedbackChoices.choices,
        blank=True,
        null=True,
        db_index=True,
        help_text="Feedback on the answer (good/bad)",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
            models.Index(fields=["group", "-created_at"]),
            models.Index(
                fields=["feedback"],
                condition=models.Q(feedback__isnull=False),
                name="chatlog_feedback_idx",
            ),
        ]
