import hashlib
import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone


class UserApiKey(models.Model):
    """API key for server-to-server integrations."""

    class AccessLevel(models.TextChoices):
        ALL = "all", "All"
        READ_ONLY = "read_only", "Read Only"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="api_keys",
    )
    name = models.CharField(max_length=100)
    access_level = models.CharField(
        max_length=20,
        choices=AccessLevel.choices,
        default=AccessLevel.ALL,
    )
    prefix = models.CharField(max_length=12, db_index=True)
    hashed_key = models.CharField(max_length=64, unique=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name"],
                condition=models.Q(revoked_at__isnull=True),
                name="unique_active_api_key_name_per_user",
            ),
        ]

    @staticmethod
    def generate_raw_key() -> str:
        return f"vq_{secrets.token_urlsafe(32)}"

    @staticmethod
    def hash_key(raw_key: str) -> str:
        return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

    @classmethod
    def create_for_user(
        cls,
        *,
        user,
        name: str,
        access_level: str = AccessLevel.ALL,
    ) -> tuple["UserApiKey", str]:
        raw_key = cls.generate_raw_key()
        api_key = cls.objects.create(
            user=user,
            name=name,
            access_level=access_level,
            prefix=raw_key[:12],
            hashed_key=cls.hash_key(raw_key),
        )
        return api_key, raw_key

    def mark_used(self) -> None:
        now = timezone.now()
        self.last_used_at = now
        self.save(update_fields=["last_used_at"])

    def revoke(self) -> None:
        if self.revoked_at is not None:
            return
        self.revoked_at = timezone.now()
        self.save(update_fields=["revoked_at"])
