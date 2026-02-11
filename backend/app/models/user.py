from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    email = models.EmailField("email address", unique=True)

    class Meta:
        indexes = [
            models.Index(fields=["email", "is_active"]),
            models.Index(fields=["date_joined", "-id"]),
        ]

    @property
    def storage_limit_bytes(self):
        """Get storage limit in bytes from subscription plan."""
        try:
            sub = self.subscription
        except Exception:
            return 5 * 1024 * 1024 * 1024  # 5GB default
        return sub.limits.get("storage_gb", 5) * 1024 * 1024 * 1024

    @property
    def storage_used_bytes(self):
        """Calculate total storage used by this user's videos."""
        total = self.videos.aggregate(total=models.Sum("file_size"))["total"]
        return total or 0
