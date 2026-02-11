from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    email = models.EmailField("email address", unique=True)

    class Meta:
        indexes = [
            models.Index(fields=["email", "is_active"]),
            models.Index(fields=["date_joined", "-id"]),
        ]

    def _get_subscription(self):
        try:
            return self.subscription
        except Exception:
            return None

    @property
    def storage_limit_bytes(self):
        """Get storage limit in bytes from subscription plan."""
        sub = self._get_subscription()
        if sub is None:
            return 5 * 1024 * 1024 * 1024  # 5GB default
        return sub.limits.get("storage_gb", 5) * 1024 * 1024 * 1024

    @property
    def storage_used_bytes(self):
        """Calculate total storage used by this user's videos."""
        total = self.videos.aggregate(total=models.Sum("file_size"))["total"]
        return total or 0

    @property
    def processing_minutes_limit(self):
        sub = self._get_subscription()
        if sub is None:
            return 30  # free default
        return sub.limits.get("processing_minutes", 30)

    @property
    def processing_minutes_used(self):
        """Sum of duration_seconds for videos uploaded in the current billing period."""
        from app.utils.billing import get_current_period_start

        sub = self._get_subscription()
        period_start = get_current_period_start(sub)
        total = self.videos.filter(
            uploaded_at__gte=period_start,
        ).aggregate(total=models.Sum("duration_seconds"))["total"]
        return (total or 0) / 60.0

    @property
    def ai_answers_limit(self):
        sub = self._get_subscription()
        if sub is None:
            return 50  # free default
        return sub.limits.get("ai_answers", 50)

    @property
    def ai_answers_used(self):
        """Count of ChatLog records in the current billing period."""
        from app.utils.billing import get_current_period_start

        sub = self._get_subscription()
        period_start = get_current_period_start(sub)
        return self.chat_logs.filter(created_at__gte=period_start).count()
