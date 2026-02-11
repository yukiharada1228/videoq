from django.conf import settings
from django.db import models

from .storage import get_default_storage


def user_directory_path(instance, filename):
    """
    Builds the upload path for a video's file using the video's user's id.
    
    Parameters:
        instance: Model instance that has a related `user` attribute with an `id`.
        filename: Original filename of the uploaded file.
    
    Returns:
        The file path where the video should be stored, formatted as "videos/{user_id}/{filename}".
    """
    return f"videos/{instance.user.id}/{filename}"


class Video(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("completed", "Completed"),
        ("error", "Error"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="videos",
        db_index=True,
    )
    file = models.FileField(
        upload_to=user_directory_path,
        storage=get_default_storage(),
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True, db_index=True)
    transcript = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True
    )
    error_message = models.TextField(blank=True)
    file_size = models.BigIntegerField(
        default=0,
        help_text="File size in bytes",
    )
    duration_seconds = models.FloatField(null=True, blank=True)
    external_id = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        unique=True,
        db_index=True,
        help_text="ID from external LMS (e.g., Moodle cm_id, Canvas content_id)",
    )
    tags = models.ManyToManyField(
        "Tag", through="VideoTag", related_name="videos_through"
    )

    class Meta:
        ordering = ["-uploaded_at"]
        indexes = [
            models.Index(fields=["user", "status", "-uploaded_at"]),
            models.Index(fields=["user", "title"]),
            models.Index(
                fields=["external_id"],
                condition=models.Q(external_id__isnull=False),
                name="video_external_id_idx",
            ),
        ]

    def __str__(self):
        """
        Return a human-readable representation of the Video combining its title and uploader.
        
        If the related user has a `username` attribute, that username is used; otherwise the uploader is represented as `user_{user_id}`.
        
        Returns:
            str: A string formatted as "{title} (by {username})".
        """
        try:
            username = self.user.username
        except AttributeError:
            username = f"user_{self.user_id}"
        return f"{self.title} (by {username})"