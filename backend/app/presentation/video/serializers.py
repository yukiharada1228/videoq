"""
Presentation layer serializers for the video domain.
Responsible for input validation and output serialization only.
Business logic (quota enforcement, task dispatch) lives in use cases.
"""

import logging
import os
import tempfile

from django.conf import settings
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from app.infrastructure.transcription.audio_processing import (
    InvalidMediaFileError,
    validate_video_media_file,
)

logger = logging.getLogger(__name__)


def _resolve_file_url(file_key, context):
    """Build an absolute media URL from file_key and serializer context."""
    if not file_key:
        return None
    if str(file_key).startswith(("http://", "https://")):
        return str(file_key)

    request = context.get("request")
    if request is None:
        return None
    media_url = settings.MEDIA_URL or "/media/"
    return request.build_absolute_uri(f"{media_url}{str(file_key).lstrip('/')}")


# ---------------------------------------------------------------------------
# Output serializers (work with entity attributes)
# ---------------------------------------------------------------------------


class VideoListSerializer(serializers.Serializer):
    """Serializer for video list view (reads VideoEntity attributes)."""

    id = serializers.IntegerField()
    file = serializers.SerializerMethodField()
    title = serializers.CharField()
    description = serializers.CharField()
    uploaded_at = serializers.DateTimeField()
    status = serializers.CharField()
    tags = serializers.SerializerMethodField()

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_tags(self, obj):
        return [
            {"id": t.id, "name": t.name, "color": t.color}
            for t in obj.tags
        ]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_file(self, obj):
        return _resolve_file_url(getattr(obj, "file_key", None), self.context)


class VideoSerializer(serializers.Serializer):
    """Serializer for Video full detail (reads VideoEntity attributes)."""

    id = serializers.IntegerField()
    user = serializers.IntegerField(source="user_id")
    file = serializers.SerializerMethodField()
    title = serializers.CharField()
    description = serializers.CharField()
    uploaded_at = serializers.DateTimeField()
    transcript = serializers.CharField(allow_null=True)
    status = serializers.CharField()
    error_message = serializers.CharField(allow_null=True)
    tags = serializers.SerializerMethodField()

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_tags(self, obj):
        return [
            {"id": t.id, "name": t.name, "color": t.color}
            for t in obj.tags
        ]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_file(self, obj):
        return _resolve_file_url(getattr(obj, "file_key", None), self.context)


class VideoGroupListSerializer(serializers.Serializer):
    """Serializer for video group list (reads VideoGroupEntity attributes)."""

    id = serializers.IntegerField()
    name = serializers.CharField()
    description = serializers.CharField()
    created_at = serializers.DateTimeField()
    video_count = serializers.IntegerField()


class VideoGroupDetailSerializer(serializers.Serializer):
    """Serializer for video group detail (includes nested videos)."""

    id = serializers.IntegerField()
    name = serializers.CharField()
    description = serializers.CharField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()
    video_count = serializers.IntegerField()
    share_token = serializers.CharField(allow_null=True)
    videos = serializers.SerializerMethodField()

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_videos(self, obj):
        members = obj.members
        if not members:
            return []
        result = []
        for member in members:
            if member.video is not None:
                video_data = VideoListSerializer(member.video, context=self.context).data
                result.append({**video_data, "order": member.order})
        return result


class TagListSerializer(serializers.Serializer):
    """Serializer for tag list (reads TagEntity attributes)."""

    id = serializers.IntegerField()
    name = serializers.CharField()
    color = serializers.CharField()
    created_at = serializers.DateTimeField()
    video_count = serializers.IntegerField()


class TagDetailSerializer(serializers.Serializer):
    """Serializer for tag detail with videos (reads TagEntity attributes)."""

    id = serializers.IntegerField()
    name = serializers.CharField()
    color = serializers.CharField()
    created_at = serializers.DateTimeField()
    video_count = serializers.IntegerField()
    videos = serializers.SerializerMethodField()

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_videos(self, obj):
        return VideoListSerializer(obj.videos, many=True, context=self.context).data


# ---------------------------------------------------------------------------
# Input serializers (for request validation)
# ---------------------------------------------------------------------------


class VideoCreateSerializer(serializers.Serializer):
    """
    Serializer for video upload.
    Validates file type only; quota and task dispatch are handled by the use case.
    """

    ALLOWED_VIDEO_EXTENSIONS = {
        ".mp4", ".mov", ".avi", ".mkv", ".webm",
        ".m4v", ".mpeg", ".mpg", ".3gp",
    }
    ALLOWED_VIDEO_MIMETYPES = {
        "video/mp4",
        "video/quicktime",
        "video/x-msvideo",
        "video/x-matroska",
        "video/webm",
        "video/x-m4v",
        "video/mpeg",
        "video/3gpp",
    }

    file = serializers.FileField()
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, default="", allow_blank=True)

    @staticmethod
    def _uploaded_file_to_path(uploaded_file):
        temp_path_getter = getattr(uploaded_file, "temporary_file_path", None)
        if callable(temp_path_getter):
            return temp_path_getter(), None

        suffix = os.path.splitext(uploaded_file.name)[1] or ".upload"
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        cleanup_path = temp_file.name

        try:
            if hasattr(uploaded_file, "seek"):
                uploaded_file.seek(0)
            chunks = (
                uploaded_file.chunks()
                if hasattr(uploaded_file, "chunks")
                else [uploaded_file.read()]
            )
            for chunk in chunks:
                temp_file.write(chunk)
        finally:
            temp_file.close()
            if hasattr(uploaded_file, "seek"):
                uploaded_file.seek(0)

        return cleanup_path, cleanup_path

    def validate_file(self, value):
        ext = os.path.splitext(value.name)[1].lower()
        if ext not in self.ALLOWED_VIDEO_EXTENSIONS:
            raise serializers.ValidationError(
                f"Unsupported file type: '{ext}'. "
                f"Allowed types: {', '.join(self.ALLOWED_VIDEO_EXTENSIONS)}"
            )
        content_type = getattr(value, "content_type", None)
        if content_type and content_type not in self.ALLOWED_VIDEO_MIMETYPES:
            raise serializers.ValidationError(
                f"Invalid content type: '{content_type}'. Only video files are allowed."
            )
        max_size_bytes = getattr(
            settings,
            "MAX_VIDEO_UPLOAD_SIZE_BYTES",
            500 * 1024 * 1024,
        )
        if value.size > max_size_bytes:
            max_size_mb = max(1, (max_size_bytes + (1024 * 1024) - 1) // (1024 * 1024))
            raise serializers.ValidationError(
                f"File size exceeds the limit of {max_size_mb} MB."
            )

        temp_path = None
        cleanup_path = None
        try:
            temp_path, cleanup_path = self._uploaded_file_to_path(value)
            validate_video_media_file(
                temp_path,
                timeout_seconds=getattr(
                    settings,
                    "FFPROBE_VALIDATION_TIMEOUT_SECONDS",
                    10,
                ),
            )
        except InvalidMediaFileError as exc:
            logger.warning("Rejected invalid video upload '%s': %s", value.name, exc)
            raise serializers.ValidationError(str(exc)) from exc
        finally:
            if cleanup_path and os.path.exists(cleanup_path):
                os.remove(cleanup_path)
        return value


class VideoUpdateSerializer(serializers.Serializer):
    """Serializer for video updates (title and description only)."""

    title = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False, allow_blank=True)


class VideoGroupCreateSerializer(serializers.Serializer):
    """Serializer for video group creation (input validation)."""

    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, default="", allow_blank=True)


class VideoGroupUpdateSerializer(serializers.Serializer):
    """Serializer for video group updates (input validation)."""

    name = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(required=False, allow_blank=True)


class AddVideosToGroupRequestSerializer(serializers.Serializer):
    video_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text="List of video IDs to add to the group",
    )


class AddVideosToGroupResponseSerializer(serializers.Serializer):
    message = serializers.CharField()
    added_count = serializers.IntegerField()
    skipped_count = serializers.IntegerField()


class AddVideoToGroupResponseSerializer(serializers.Serializer):
    message = serializers.CharField()
    id = serializers.IntegerField()


class ReorderVideosRequestSerializer(serializers.Serializer):
    video_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text="List of video IDs in the desired order",
    )


class VideoActionMessageResponseSerializer(serializers.Serializer):
    message = serializers.CharField()


class ShareLinkResponseSerializer(serializers.Serializer):
    message = serializers.CharField()
    share_token = serializers.CharField()


class TagCreateSerializer(serializers.Serializer):
    """Serializer for tag creation (input validation)."""

    name = serializers.CharField(max_length=50, trim_whitespace=False)
    color = serializers.CharField()


class TagUpdateSerializer(serializers.Serializer):
    """Serializer for tag updates (input validation)."""

    name = serializers.CharField(max_length=50, required=False, trim_whitespace=False)
    color = serializers.CharField(required=False)


class AddTagsToVideoRequestSerializer(serializers.Serializer):
    tag_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text="List of tag IDs to add to the video",
    )


class AddTagsToVideoResponseSerializer(serializers.Serializer):
    message = serializers.CharField()
    added_count = serializers.IntegerField()
    skipped_count = serializers.IntegerField()
