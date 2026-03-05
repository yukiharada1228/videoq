"""
Presentation layer serializers for the video domain.
Responsible for input validation and output serialization only.
Business logic (quota enforcement, task dispatch) lives in use cases.
"""

import logging
import os
import re

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

logger = logging.getLogger(__name__)


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

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_file(self, obj):
        resolver = self.context.get("file_url_resolver")
        if resolver and obj.file_key:
            return resolver.resolve(obj.file_key)
        return None

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_tags(self, obj):
        return [
            {"id": t.id, "name": t.name, "color": t.color}
            for t in obj.tags
        ]


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

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_file(self, obj):
        resolver = self.context.get("file_url_resolver")
        if resolver and obj.file_key:
            return resolver.resolve(obj.file_key)
        return None

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_tags(self, obj):
        return [
            {"id": t.id, "name": t.name, "color": t.color}
            for t in obj.tags
        ]


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

    name = serializers.CharField(max_length=50)
    color = serializers.CharField()

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Tag name cannot be empty")
        return value.strip()

    def validate_color(self, value):
        if not re.match(r"^#[0-9A-Fa-f]{6}$", value):
            raise serializers.ValidationError("Invalid color format. Use #RRGGBB")
        return value


class TagUpdateSerializer(serializers.Serializer):
    """Serializer for tag updates (input validation)."""

    name = serializers.CharField(max_length=50, required=False)
    color = serializers.CharField(required=False)

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Tag name cannot be empty")
        return value.strip()

    def validate_color(self, value):
        if not re.match(r"^#[0-9A-Fa-f]{6}$", value):
            raise serializers.ValidationError("Invalid color format. Use #RRGGBB")
        return value


class AddTagsToVideoRequestSerializer(serializers.Serializer):
    tag_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text="List of tag IDs to add to the video",
    )


class AddTagsToVideoResponseSerializer(serializers.Serializer):
    message = serializers.CharField()
    added_count = serializers.IntegerField()
    skipped_count = serializers.IntegerField()
