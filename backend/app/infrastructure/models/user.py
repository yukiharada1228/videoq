from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models


def _default_video_limit():
    # Kept for historical migration imports after removing the field itself.
    return getattr(settings, "DEFAULT_VIDEO_LIMIT", 5)


def _default_max_video_upload_size_mb():
    return getattr(settings, "MAX_VIDEO_UPLOAD_SIZE_MB", 500)


class User(AbstractUser):
    email = models.EmailField("email address", unique=True)
    max_video_upload_size_mb = models.PositiveIntegerField(
        default=_default_max_video_upload_size_mb,
        help_text="Maximum video upload size in MB for this user.",
    )
    storage_limit_gb = models.FloatField(default=50)
    processing_limit_minutes = models.IntegerField(default=600)
    ai_answers_limit = models.IntegerField(default=7000)
    used_storage_bytes = models.BigIntegerField(default=0)
    used_processing_seconds = models.IntegerField(default=0)
    used_ai_answers = models.IntegerField(default=0)
    usage_period_start = models.DateTimeField(null=True, blank=True)
    unlimited_processing_minutes = models.BooleanField(default=False)
    unlimited_ai_answers = models.BooleanField(default=False)
    is_over_quota = models.BooleanField(default=False)
    searchapi_api_key_encrypted = models.BinaryField(
        null=True,
        blank=True,
        help_text="Encrypted SearchAPI API key",
    )
    deactivated_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["email", "is_active"]),
            models.Index(fields=["date_joined", "-id"]),
        ]
