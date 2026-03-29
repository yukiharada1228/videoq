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
    SOURCE_TYPE_CHOICES = [
        ("uploaded", "Uploaded"),
        ("youtube", "YouTube"),
    ]
    STATUS_CHOICES = [
        ("uploading", "Uploading"),
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("indexing", "Indexing"),
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
        blank=True,
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    source_type = models.CharField(
        max_length=20, choices=SOURCE_TYPE_CHOICES, default="uploaded", db_index=True
    )
    source_url = models.URLField(blank=True)
    youtube_video_id = models.CharField(max_length=32, blank=True, db_index=True)
    uploaded_at = models.DateTimeField(auto_now_add=True, db_index=True)
    transcript = models.TextField(blank=True)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True
    )
    error_message = models.TextField(blank=True)
    tags = models.ManyToManyField(
        "Tag", through="VideoTag", related_name="videos_through"
    )

    class Meta:
        ordering = ["-uploaded_at"]
        indexes = [
            models.Index(fields=["user", "status", "-uploaded_at"]),
            models.Index(fields=["user", "title"]),
            models.Index(fields=["user", "source_type", "-uploaded_at"]),
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
