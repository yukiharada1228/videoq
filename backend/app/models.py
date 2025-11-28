import os
import time

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.files.storage import FileSystemStorage
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from storages.backends.s3boto3 import S3Boto3Storage


class User(AbstractUser):
    email = models.EmailField("email address", unique=True)


def user_directory_path(instance, filename):
    return f"videos/{instance.user.id}/{filename}"


class SafeFileSystemStorage(FileSystemStorage):
    """
    Safe file storage for local use with timestamp-based filename conversion
    """

    def get_available_name(self, name, max_length=None):
        """
        Convert filename to safe format and avoid duplicates
        """
        # Convert absolute path to relative path
        if os.path.isabs(name):
            name = os.path.basename(name)

        # Split into directory and filename parts
        dir_name = os.path.dirname(name)
        base_name = os.path.basename(name)
        safe_base_name = self._get_safe_filename(base_name)
        # Join if directory exists, otherwise filename only
        safe_name = (
            os.path.join(dir_name, safe_base_name) if dir_name else safe_base_name
        )

        # Call original get_available_name method for duplicate check
        return super().get_available_name(safe_name, max_length)

    def _get_safe_filename(self, filename):
        """
        Convert filename to timestamp-based safe format
        """
        # Get file extension
        _, ext = os.path.splitext(filename)

        # Generate timestamp-based filename
        timestamp = int(time.time() * 1000)  # Timestamp in milliseconds

        # Generate safe filename
        safe_name = f"video_{timestamp}{ext}"

        return safe_name


class SafeS3Boto3Storage(S3Boto3Storage):
    """
    Custom S3 storage with safe processing and timestamp-based filename conversion
    """

    def get_available_name(self, name, max_length=None):
        """
        Convert filename to safe format and avoid duplicates
        """
        # Convert absolute path to relative path
        if os.path.isabs(name):
            name = os.path.basename(name)

        # Split into directory and filename parts
        dir_name = os.path.dirname(name)
        base_name = os.path.basename(name)
        safe_base_name = self._get_safe_filename(base_name)
        # Join if directory exists, otherwise filename only
        safe_name = (
            os.path.join(dir_name, safe_base_name) if dir_name else safe_base_name
        )

        # Call original get_available_name method for duplicate check
        return super().get_available_name(safe_name, max_length)

    def _get_safe_filename(self, filename):
        """
        Convert filename to timestamp-based safe format
        """
        # Get file extension
        _, ext = os.path.splitext(filename)

        # Generate timestamp-based filename
        timestamp = int(time.time() * 1000)  # Timestamp in milliseconds

        # Generate safe filename
        safe_name = f"video_{timestamp}{ext}"

        return safe_name

    def _normalize_name(self, name):
        """
        Normalize filename (for S3)
        """
        # Convert absolute path to relative path
        if os.path.isabs(name):
            name = os.path.basename(name)

        # Normalize slashes
        name = name.replace("\\", "/")

        # Remove leading slash
        if name.startswith("/"):
            name = name[1:]

        # Call parent's _normalize_name to apply location prefix
        return super()._normalize_name(name)


def get_default_storage():
    """
    Get default storage based on settings.
    Uses Django's default_storage which is configured via STORAGES setting.
    """
    from django.core.files.storage import default_storage

    return default_storage


class Video(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("processing", "Processing"),
        ("completed", "Completed"),
        ("error", "Error"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="videos"
    )
    file = models.FileField(
        upload_to=user_directory_path,
        storage=get_default_storage(),
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    transcript = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    error_message = models.TextField(blank=True)
    duration_minutes = models.FloatField(
        null=True,
        blank=True,
        help_text="Video duration in minutes (for Whisper usage tracking)",
    )
    is_external_upload = models.BooleanField(
        default=False,
        help_text="Whether this is an upload from an external API client (file will be deleted after processing)",
    )

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        try:
            username = self.user.username
        except AttributeError:
            username = f"user_{self.user_id}"
        return f"{self.title} (by {username})"


@receiver(post_delete, sender=Video)
def delete_video_vectors_signal(sender, instance, **kwargs):
    """
    Delete vector data from PGVector when Video is deleted
    """
    try:
        from app.utils.vector_manager import delete_video_vectors

        delete_video_vectors(instance.id)

    except Exception as e:
        # Vector deletion failure should not prevent video deletion
        import logging

        logger = logging.getLogger(__name__)
        logger.warning(f"Failed to delete vectors for video {instance.id}: {e}")


class VideoGroup(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="video_groups"
    )
    name = models.CharField(max_length=255, help_text="Group name")
    description = models.TextField(blank=True, help_text="Group description")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Share token (for external sharing URLs)
    share_token = models.CharField(
        max_length=64, unique=True, null=True, blank=True, help_text="Share token"
    )

    # Define relationship with videos using ManyToManyField
    videos = models.ManyToManyField(
        "Video", through="VideoGroupMember", related_name="video_groups_through"
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        try:
            username = self.user.username
        except AttributeError:
            username = f"user_{self.user_id}"
        return f"{self.name} (by {username})"


class VideoGroupMember(models.Model):
    group = models.ForeignKey(
        VideoGroup, on_delete=models.CASCADE, related_name="members"
    )
    video = models.ForeignKey("Video", on_delete=models.CASCADE, related_name="groups")
    added_at = models.DateTimeField(auto_now_add=True)
    order = models.IntegerField(default=0, help_text="Order within the group")

    class Meta:
        ordering = ["order", "added_at"]
        unique_together = [
            "group",
            "video",
        ]  # Cannot add the same video to the same group multiple times

    def __str__(self):
        try:
            video_title = self.video.title
        except AttributeError:
            video_title = f"video_{self.video_id}"

        try:
            group_name = self.group.name
        except AttributeError:
            group_name = f"group_{self.group_id}"

        return f"{video_title} in {group_name}"


class ChatLog(models.Model):
    class FeedbackChoices(models.TextChoices):
        GOOD = "good", "Good"
        BAD = "bad", "Bad"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_logs"
    )
    group = models.ForeignKey(
        "VideoGroup", on_delete=models.CASCADE, related_name="chat_logs"
    )
    question = models.TextField()
    answer = models.TextField()
    related_videos = models.JSONField(default=list, blank=True)
    is_shared_origin = models.BooleanField(default=False)
    feedback = models.CharField(
        max_length=4,
        choices=FeedbackChoices.choices,
        blank=True,
        null=True,
        help_text="Feedback on the answer (good/bad)",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
