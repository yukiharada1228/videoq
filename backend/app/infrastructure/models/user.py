from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    email = models.EmailField("email address", unique=True)
    video_limit = models.PositiveIntegerField(
        null=True,
        blank=True,
        default=0,
        db_index=True,
        help_text="Maximum number of videos user can upload. 0 means no uploads allowed, null means unlimited.",
    )
    deactivated_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["email", "is_active"]),
            models.Index(fields=["date_joined", "-id"]),
        ]
