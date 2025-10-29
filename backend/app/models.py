import os
import time
import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.files.storage import FileSystemStorage
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver


class User(AbstractUser):
    encrypted_openai_api_key = models.TextField(
        blank=True, null=True, help_text="Encrypted OpenAI API key"
    )


def user_directory_path(instance, filename):
    return f"videos/{instance.user.id}/{filename}"


class SafeFileStorage(FileSystemStorage):
    """
    Safe file storage for local use
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

        # Generate safe filename with UUID for better uniqueness
        safe_name = f"video_{timestamp}_{str(uuid.uuid4())[:8]}{ext}"

        return safe_name


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
        storage=SafeFileStorage(),
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    transcript = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        # N+1問題対策: userが読み込まれていない場合はidを使用
        try:
            username = self.user.username
        except AttributeError:
            username = f"user_{self.user_id}"
        return f"{self.title} (by {username})"


@receiver(post_delete, sender=Video)
def delete_video_vectors(sender, instance, **kwargs):
    """
    Videoが削除された際にPGVectorからベクトルデータも削除（DRY原則・N+1問題対策）
    """
    try:
        # DRY原則: PGVectorManagerを使用してベクトル削除
        from app.utils.vector_manager import PGVectorManager
        
        def delete_operation(cursor):
            delete_query = """
                DELETE FROM langchain_pg_embedding 
                WHERE cmetadata->>'video_id' = %s
            """
            cursor.execute(delete_query, (str(instance.id),))
            return cursor.rowcount

        deleted_count = PGVectorManager.execute_with_connection(delete_operation)
        
        if deleted_count > 0:
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"Deleted {deleted_count} vector documents for video {instance.id}")
            
    except Exception as e:
        # ベクトル削除の失敗は動画削除を阻害しない（DRY原則）
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
        # N+1問題対策: userが読み込まれていない場合はidを使用
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
        # N+1問題対策: videoとgroupが読み込まれていない場合はidを使用
        try:
            video_title = self.video.title
        except AttributeError:
            video_title = f"video_{self.video_id}"

        try:
            group_name = self.group.name
        except AttributeError:
            group_name = f"group_{self.group_id}"

        return f"{video_title} in {group_name}"
