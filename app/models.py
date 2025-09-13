import os
import time

from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.core.files.storage import FileSystemStorage
from django.db import models
from storages.backends.s3boto3 import S3Boto3Storage


class User(AbstractUser):
    # OpenAI API key (encrypted storage)
    encrypted_openai_api_key = models.TextField(
        blank=True, null=True, help_text="Encrypted OpenAI API key"
    )
    # User-specific video limit (uses default setting if null)
    video_limit = models.IntegerField(
        null=True,
        blank=True,
        help_text="Video limit for this user (applies default limit if null)",
    )

    def __str__(self):
        return self.username

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        """Delete Pinecone/OpenSearch data when user is deleted"""
        try:
            from app.vector_search_factory import VectorSearchFactory

            if VectorSearchFactory.is_pinecone_enabled():
                from app.pinecone_service import PineconeService

                # API key not needed (namespace deletion only)
                pinecone_service = PineconeService(
                    user_id=self.id, openai_api_key=None, ensure_indexes=False
                )
                pinecone_service.delete_user_namespace()
            if VectorSearchFactory.is_opensearch_enabled():
                from app.opensearch_service import OpenSearchService

                opensearch_service = OpenSearchService(
                    user_id=self.id, openai_api_key=None, ensure_indexes=False
                )
                opensearch_service.delete_user_data()
        except Exception as e:
            print(f"[User.delete] Error deleting vector DB data: {e}")
        super().delete(*args, **kwargs)

    def get_video_limit(self) -> int:
        """Return the video limit applicable to this user.

        Uses the user-specific `video_limit` if set,
        otherwise uses `settings.DEFAULT_MAX_VIDEOS_PER_USER`.
        """
        # Lazy import to avoid circular references
        from django.conf import settings as _settings

        default_limit = getattr(_settings, "DEFAULT_MAX_VIDEOS_PER_USER", 100)
        if self.video_limit is not None:
            try:
                limit = int(self.video_limit)
            except Exception:
                limit = int(default_limit)
        else:
            try:
                limit = int(default_limit)
            except Exception:
                limit = 100
        return max(0, limit)


class SafeLocalFileStorage(FileSystemStorage):
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

        # Generate safe filename
        safe_name = f"video_{timestamp}{ext}"

        return safe_name


class SafeFileStorage(S3Boto3Storage):
    """
    Custom S3 storage with safe processing
    """

    def __init__(self, *args, **kwargs):
        # Add S3 configuration
        kwargs.update(
            {
                "bucket_name": os.environ.get("AWS_STORAGE_BUCKET_NAME"),
                "access_key": os.environ.get("AWS_ACCESS_KEY_ID"),
                "secret_key": os.environ.get("AWS_SECRET_ACCESS_KEY"),
                "location": "media/videos",  # Directory in S3
                "default_acl": "private",
                "custom_domain": False,
                "querystring_auth": True,
                "querystring_expire": 3600,
                "file_overwrite": False,  # Prevent file overwriting
            }
        )
        super().__init__(*args, **kwargs)

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

        return name


class VideoGroup(models.Model):
    """Video group (playlist-like concept)"""

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
        return f"{self.name} (by {self.user.username})"

    @property
    def video_count(self):
        """Get count of visible videos in the group"""
        return self.videos.filter(is_visible=True).count()

    @property
    def completed_videos(self):
        """Get only completed visible videos"""
        return self.videos.filter(status="completed", is_visible=True)

    @property
    def all_videos(self):
        """Get all videos (including hidden ones) for management"""
        return self.videos.all()

    @property
    def all_completed_videos(self):
        """Get all completed videos (including hidden ones) for management"""
        return self.videos.filter(status="completed")


class VideoGroupMember(models.Model):
    """Video group member (relationship between video and group)"""

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
        return f"{self.video.title} in {self.group.name}"


def user_directory_path(instance, filename):
    # Example: videos/user_id/filename
    return f"videos/{instance.user.id}/{filename}"


class Tag(models.Model):
    """Tags attached to videos (managed per user)"""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="tags",
    )
    name = models.CharField(max_length=64)
    color = models.CharField(max_length=16, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "name")
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} (by {self.user.username})"


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
        storage=(
            SafeFileStorage()
            if os.environ.get("USE_S3", "FALSE") == "TRUE"
            else SafeLocalFileStorage()
        ),
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    transcript = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    error_message = models.TextField(blank=True)
    tags = models.ManyToManyField("Tag", blank=True, related_name="videos")
    # Add visibility control field
    is_visible = models.BooleanField(default=True, help_text="Control video visibility")

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.title} (by {self.user.username})"

    @classmethod
    def get_visible_videos_for_user(cls, user):
        """Get only visible videos for the user"""
        return cls.objects.filter(user=user, is_visible=True)

    @classmethod
    def hide_oldest_videos_for_user(cls, user, limit, exclude_video_id=None):
        """Hide oldest videos when user's video count exceeds limit"""
        visible_videos = cls.get_visible_videos_for_user(user)

        # Exclude specified video ID if provided
        if exclude_video_id:
            visible_videos = visible_videos.exclude(id=exclude_video_id)

        current_count = visible_videos.count()

        if current_count > limit:
            # Hide from oldest videos
            # Get list of IDs before slicing
            videos_to_hide_ids = list(
                visible_videos.order_by("uploaded_at")[
                    : current_count - limit
                ].values_list("id", flat=True)
            )
            if videos_to_hide_ids:
                # Update using list of IDs
                cls.objects.filter(id__in=videos_to_hide_ids).update(is_visible=False)
                return len(videos_to_hide_ids)
        return 0

    @classmethod
    def check_and_hide_over_limit_videos(cls, user):
        """Hide oldest videos if existing videos exceed limit"""
        limit = user.get_video_limit()
        return cls.hide_oldest_videos_for_user(user, limit)

    @classmethod
    def restore_hidden_videos_if_under_limit(cls, user):
        """Restore hidden videos if limit is relaxed"""
        limit = user.get_video_limit()
        visible_count = cls.get_visible_videos_for_user(user).count()
        hidden_videos = cls.objects.filter(user=user, is_visible=False)

        # Restore hidden videos if visible count is below limit
        if visible_count < limit and hidden_videos.exists():
            # Calculate number of videos to restore
            restore_count = min(limit - visible_count, hidden_videos.count())

            # Restore in order of oldest (by upload date)
            videos_to_restore_ids = list(
                hidden_videos.order_by("uploaded_at")[:restore_count].values_list(
                    "id", flat=True
                )
            )

            if videos_to_restore_ids:
                cls.objects.filter(id__in=videos_to_restore_ids).update(is_visible=True)
                return len(videos_to_restore_ids)

        return 0

    def delete(self, *args, **kwargs):
        """
        Completely delete video (file, OpenSearchService, DB)
        """
        try:
            # Delete S3 file
            if self.file:
                try:
                    self.file.delete(save=False)
                except Exception as e:
                    print(f"Error deleting file: {e}")

            # Delete vector data from vector search service
            try:
                from app.vector_search_factory import VectorSearchFactory

                search_service = VectorSearchFactory.create_search_service(
                    user_id=self.user.id
                )
                search_service.delete_video_data(self.id)
            except Exception as e:
                print(f"Error deleting vector search service vectors: {e}")

            # Delete DB record
            super().delete(*args, **kwargs)

        except Exception as e:
            print(f"Error in video deletion: {e}")
            # Delete DB record even if error occurs
            super().delete(*args, **kwargs)


class VideoGroupChatLog(models.Model):
    SOURCE_CHOICES = [
        ("owner", "Owner"),
        ("share", "Share"),
    ]

    group = models.ForeignKey(
        VideoGroup, on_delete=models.CASCADE, related_name="chat_logs"
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_logs"
    )
    source = models.CharField(max_length=16, choices=SOURCE_CHOICES)
    session_id = models.CharField(
        max_length=64, blank=True, null=True, help_text="Session ID for shared access"
    )
    question = models.TextField()
    answer = models.TextField(blank=True, default="")
    timestamp_results = models.JSONField(blank=True, null=True)
    related_questions = models.JSONField(blank=True, null=True)
    requester_ip = models.GenericIPAddressField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    approx_size = models.BigIntegerField(
        default=0, help_text="Approximate size (bytes)"
    )

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["group", "created_at"]),
            models.Index(fields=["owner", "created_at"]),
            models.Index(fields=["source", "created_at"]),
        ]

    def __str__(self):
        return f"[{self.get_source_display()}] {self.group.name}: {self.question[:20]}"
