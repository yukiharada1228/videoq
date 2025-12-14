import os
import time

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.files.storage import FileSystemStorage
from django.db import models, transaction
from django.db.models.signals import post_delete, pre_save
from django.dispatch import receiver
from storages.backends.s3boto3 import S3Boto3Storage


class User(AbstractUser):
    email = models.EmailField("email address", unique=True)
    openai_api_key_encrypted = models.BinaryField(
        null=True, blank=True, help_text="Encrypted OpenAI API key"
    )
    video_limit = models.PositiveIntegerField(
        null=True,
        blank=True,
        default=0,
        help_text="Maximum number of videos user can upload. 0 means no uploads allowed, null means unlimited.",
    )


def user_directory_path(instance, filename):
    return f"videos/{instance.user.id}/{filename}"


class SafeFilenameMixin:
    """
    Mixin class that provides safe filename handling with timestamp-based conversion
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


class SafeFileSystemStorage(SafeFilenameMixin, FileSystemStorage):
    """
    Safe file storage for local use with timestamp-based filename conversion
    """

    pass


class SafeS3Boto3Storage(SafeFilenameMixin, S3Boto3Storage):
    """
    Custom S3 storage with safe processing and timestamp-based filename conversion
    """

    def _normalize_name(self, name):
        """
        Normalize filename for S3 (handle Windows paths and ensure proper S3 key format)
        """
        # Normalize slashes (Windows backslash to Unix slash)
        name = name.replace("\\", "/")

        # Remove leading slash (S3 object keys should not start with /)
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


def _should_delete_videos(old_limit, new_limit):
    """
    Determine if videos should be deleted based on limit change.

    Returns True if:
    - old_limit is None (unlimited) and new_limit is not None
    - old_limit is a number and new_limit is a smaller number (including 0)

    Returns False if:
    - old_limit == new_limit (no change)
    - new_limit is None (changing to unlimited)
    - new_limit > old_limit (increasing limit)
    """
    # No change
    if old_limit == new_limit:
        return False

    # Changing to unlimited - keep all videos
    if new_limit is None:
        return False

    # From unlimited to limited
    if old_limit is None:
        return True

    # From limited to more limited
    if new_limit < old_limit:
        return True

    return False


@receiver(pre_save, sender=User)
def handle_video_limit_reduction(sender, instance, **kwargs):
    """
    Automatically delete excess videos when video_limit is reduced.
    Deletes oldest videos first (based on uploaded_at ascending).
    """
    # Skip if this is a new user (not yet saved)
    if instance.pk is None:
        return

    try:
        # Fetch old value from database
        old_user = User.objects.get(pk=instance.pk)
        old_limit = old_user.video_limit
        new_limit = instance.video_limit

        # Check if deletion is needed
        if not _should_delete_videos(old_limit, new_limit):
            return

        # Calculate how many videos to keep
        videos_to_keep = new_limit if new_limit is not None else float("inf")

        # Get current video count
        current_count = Video.objects.filter(user=instance).count()

        # Calculate how many videos to delete
        videos_to_delete_count = current_count - videos_to_keep

        # Query videos to delete (oldest first)
        if videos_to_delete_count > 0:
            videos_to_delete = Video.objects.filter(user=instance).order_by(
                "uploaded_at"
            )[  # ASC - oldest first
                :videos_to_delete_count
            ]  # Delete first N oldest videos
        else:
            videos_to_delete = Video.objects.none()

        # Delete in transaction
        with transaction.atomic():
            count = videos_to_delete.count()
            if count > 0:
                for video in videos_to_delete:
                    # Delete file explicitly
                    if video.file:
                        video.file.delete(save=False)
                    # Delete video instance (triggers CASCADE and post_delete signal)
                    video.delete()

                import logging

                logger = logging.getLogger(__name__)
                logger.info(
                    f"Deleted {count} excess videos for user {instance.username} "
                    f"(video_limit reduced from {old_limit} to {new_limit})"
                )

    except User.DoesNotExist:
        # New user, skip
        pass
    except Exception as e:
        import logging

        logger = logging.getLogger(__name__)
        logger.error(f"Failed to delete excess videos for user {instance.pk}: {e}")
        # Re-raise to prevent save if deletion fails
        raise


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
