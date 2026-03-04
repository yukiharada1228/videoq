"""
Presentation layer serializers for the video domain.
Responsible for input validation and output serialization only.
Business logic (quota enforcement, task dispatch) lives in use cases.
"""

import logging
import os
import re

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from app.models import Tag, Video, VideoGroup

logger = logging.getLogger(__name__)


class VideoSerializer(serializers.ModelSerializer):
    """Serializer for Video model (full detail)."""

    tags = serializers.SerializerMethodField()

    class Meta:
        model = Video
        fields = [
            "id",
            "user",
            "file",
            "title",
            "description",
            "uploaded_at",
            "transcript",
            "status",
            "error_message",
            "tags",
        ]
        read_only_fields = ["id", "user", "uploaded_at"]

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_tags(self, obj):
        video_tags = obj.video_tags.all()
        return [
            {"id": vt.tag.id, "name": vt.tag.name, "color": vt.tag.color}
            for vt in video_tags
        ]


class VideoCreateSerializer(serializers.ModelSerializer):
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

    class Meta:
        model = Video
        fields = ["id", "file", "title", "description"]
        read_only_fields = ["id"]

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


class VideoUpdateSerializer(serializers.ModelSerializer):
    """Serializer for video updates (title and description only)."""

    class Meta:
        model = Video
        fields = ["id", "title", "description"]
        read_only_fields = ["id"]


class VideoListSerializer(serializers.ModelSerializer):
    """Serializer for video list view."""

    tags = serializers.SerializerMethodField()

    class Meta:
        model = Video
        fields = [
            "id", "file", "title", "description",
            "uploaded_at", "status", "tags",
        ]
        read_only_fields = ["id", "uploaded_at"]

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_tags(self, obj):
        video_tags = obj.video_tags.all()
        return [
            {"id": vt.tag.id, "name": vt.tag.name, "color": vt.tag.color}
            for vt in video_tags
        ]


class VideoGroupListSerializer(serializers.ModelSerializer):
    """Serializer for video group list."""

    video_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = VideoGroup
        fields = ["id", "name", "description", "created_at", "video_count"]
        read_only_fields = ["id", "created_at", "video_count"]


class VideoGroupDetailSerializer(serializers.ModelSerializer):
    """Serializer for video group detail (includes nested videos)."""

    video_count = serializers.IntegerField(read_only=True)
    videos = serializers.SerializerMethodField()

    class Meta:
        model = VideoGroup
        fields = [
            "id", "name", "description", "created_at", "updated_at",
            "video_count", "videos", "share_token",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "video_count", "share_token"]

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_videos(self, obj):
        members = list(obj.members.all())
        if not members:
            return []
        videos = [member.video for member in members]
        video_data_list = VideoListSerializer(
            videos, many=True, context=self.context
        ).data
        return [
            {**video_data, "order": member.order}
            for member, video_data in zip(members, video_data_list)
        ]


class VideoGroupCreateSerializer(serializers.ModelSerializer):
    """Serializer for video group creation."""

    video_count = serializers.SerializerMethodField()

    class Meta:
        model = VideoGroup
        fields = ["id", "name", "description", "created_at", "video_count"]
        read_only_fields = ["id", "created_at", "video_count"]

    @extend_schema_field(OpenApiTypes.INT)
    def get_video_count(self, obj) -> int:
        return getattr(obj, "video_count", 0)


class VideoGroupUpdateSerializer(serializers.ModelSerializer):
    """Serializer for video group updates."""

    class Meta:
        model = VideoGroup
        fields = ["id", "name", "description"]
        read_only_fields = ["id"]


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


class TagListSerializer(serializers.ModelSerializer):
    video_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Tag
        fields = ["id", "name", "color", "created_at", "video_count"]
        read_only_fields = ["id", "created_at", "video_count"]


class TagDetailSerializer(serializers.ModelSerializer):
    video_count = serializers.IntegerField(read_only=True)
    videos = serializers.SerializerMethodField()

    class Meta:
        model = Tag
        fields = ["id", "name", "color", "created_at", "video_count", "videos"]
        read_only_fields = ["id", "created_at", "video_count"]

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_videos(self, obj):
        video_tags = obj.video_tags.all()
        return VideoListSerializer(
            [vt.video for vt in video_tags], many=True, context=self.context
        ).data


class TagCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name", "color"]
        read_only_fields = ["id"]

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Tag name cannot be empty")
        return value.strip()

    def validate_color(self, value):
        if not re.match(r"^#[0-9A-Fa-f]{6}$", value):
            raise serializers.ValidationError("Invalid color format. Use #RRGGBB")
        return value


class TagUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name", "color"]
        read_only_fields = ["id"]

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
