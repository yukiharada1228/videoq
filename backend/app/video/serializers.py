import logging

from rest_framework import serializers

from app.models import Tag, Video, VideoGroup, VideoTag
from app.tasks import transcribe_video

logger = logging.getLogger(__name__)


class UserOwnedSerializerMixin:
    """Common serializer base class for user-owned resources"""

    def create(self, validated_data):
        """Set user to current user"""
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)


class BaseVideoGroupSerializer(serializers.ModelSerializer):
    """Common base serializer for VideoGroup"""

    class Meta:
        model = VideoGroup
        fields = ["name", "description"]


class VideoSerializer(serializers.ModelSerializer):
    """Serializer for Video model"""

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
            "external_id",
            "tags",
        ]
        read_only_fields = ["id", "user", "uploaded_at"]

    def get_tags(self, obj):
        """Get tags for the video"""
        video_tags = obj.video_tags.all()
        tags = [vt.tag for vt in video_tags]
        return [{"id": t.id, "name": t.name, "color": t.color} for t in tags]


class VideoCreateSerializer(UserOwnedSerializerMixin, serializers.ModelSerializer):
    """Serializer for Video creation"""

    class Meta:
        model = Video
        fields = ["id", "file", "title", "description", "external_id"]
        read_only_fields = ["id"]

    def validate_external_id(self, value):
        """
        Normalize empty string to None.

        external_id is unique, so storing "" would prevent multiple uploads without a real ID.
        """
        if value is not None and str(value).strip() == "":
            return None
        return value

    def validate(self, attrs):
        """Validate video upload limit"""
        user = self.context["request"].user

        # Check video limit
        video_limit = user.video_limit

        # If video_limit is None, unlimited uploads are allowed
        if video_limit is None:
            return attrs

        # Get current video count for the user
        current_video_count = Video.objects.filter(user=user).count()

        # If video_limit is 0, no uploads are allowed
        # If video_limit is > 0, check if user has reached the limit
        if current_video_count >= video_limit:
            raise serializers.ValidationError(
                f"Video upload limit reached. You can upload up to {video_limit} video(s)."
            )

        return attrs

    def create(self, validated_data):
        """Start transcription task when Video is created"""
        # Create Video instance
        video = super().create(validated_data)

        # Execute Celery task asynchronously
        logger.info(f"Starting transcription task for video ID: {video.id}")
        try:
            task = transcribe_video.delay(video.id)
            logger.info(f"Transcription task created with ID: {task.id}")
        except Exception as e:
            logger.error(f"Failed to start transcription task: {e}")

        return video


class VideoUpdateSerializer(serializers.ModelSerializer):
    """Serializer for Video update"""

    class Meta:
        model = Video
        fields = ["title", "description"]


class VideoListSerializer(serializers.ModelSerializer):
    """Serializer for Video list"""

    tags = serializers.SerializerMethodField()

    class Meta:
        model = Video
        fields = [
            "id",
            "file",
            "title",
            "description",
            "uploaded_at",
            "status",
            "external_id",
            "tags",
        ]
        read_only_fields = ["id", "uploaded_at"]

    def get_tags(self, obj):
        """Get tags for the video"""
        video_tags = obj.video_tags.all()
        tags = [vt.tag for vt in video_tags]
        return [{"id": t.id, "name": t.name, "color": t.color} for t in tags]


class VideoGroupListSerializer(serializers.ModelSerializer):
    """Serializer for VideoGroup list"""

    video_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = VideoGroup
        fields = ["id", "name", "description", "created_at", "video_count"]
        read_only_fields = ["id", "created_at", "video_count"]


class VideoGroupDetailSerializer(serializers.ModelSerializer):
    """Serializer for VideoGroup detail"""

    video_count = serializers.IntegerField(read_only=True)
    videos = serializers.SerializerMethodField()

    class Meta:
        model = VideoGroup
        fields = [
            "id",
            "name",
            "description",
            "created_at",
            "updated_at",
            "video_count",
            "videos",
            "share_token",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "video_count",
            "share_token",
        ]

    def get_videos(self, obj):
        """Get video detailed information"""
        members = list(obj.members.all())

        if not members:
            return []

        return self._serialize_members_with_order(members)

    def _serialize_members_with_order(self, members):
        """Serialize members with order information"""
        # Serialize each video using VideoListSerializer (automatically generates absolute URL)
        videos = [member.video for member in members]
        video_data_list = VideoListSerializer(
            videos, many=True, context=self.context
        ).data

        # Add order information and return
        return [
            {**video_data, "order": member.order}
            for member, video_data in zip(members, video_data_list)
        ]


class VideoGroupCreateSerializer(UserOwnedSerializerMixin, BaseVideoGroupSerializer):
    """Serializer for VideoGroup creation"""

    pass


class VideoGroupUpdateSerializer(BaseVideoGroupSerializer):
    """Serializer for VideoGroup update"""

    pass


class AddVideosToGroupRequestSerializer(serializers.Serializer):
    """Request serializer for adding videos to group"""

    video_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text="List of video IDs to add to the group",
    )


class AddVideosToGroupResponseSerializer(serializers.Serializer):
    """Response serializer for adding videos to group"""

    message = serializers.CharField(help_text="Success message")
    added_count = serializers.IntegerField(help_text="Number of videos added")
    skipped_count = serializers.IntegerField(
        help_text="Number of videos skipped (already in group)"
    )


class ReorderVideosRequestSerializer(serializers.Serializer):
    """Request serializer for reordering videos in group"""

    video_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text="List of video IDs in the desired order",
    )


class MessageResponseSerializer(serializers.Serializer):
    """Generic message response serializer"""

    message = serializers.CharField(help_text="Response message")


class TagListSerializer(serializers.ModelSerializer):
    """Serializer for Tag list"""

    video_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Tag
        fields = ["id", "name", "color", "created_at", "video_count"]
        read_only_fields = ["id", "created_at", "video_count"]


class TagDetailSerializer(serializers.ModelSerializer):
    """Serializer for Tag detail"""

    video_count = serializers.IntegerField(read_only=True)
    videos = serializers.SerializerMethodField()

    class Meta:
        model = Tag
        fields = ["id", "name", "color", "created_at", "video_count", "videos"]
        read_only_fields = ["id", "created_at", "video_count"]

    def get_videos(self, obj):
        """Get videos with this tag"""
        video_tags = obj.video_tags.all()
        videos = [vt.video for vt in video_tags]
        return VideoListSerializer(videos, many=True, context=self.context).data


class TagCreateSerializer(UserOwnedSerializerMixin, serializers.ModelSerializer):
    """Serializer for Tag creation"""

    class Meta:
        model = Tag
        fields = ["id", "name", "color"]
        read_only_fields = ["id"]

    def validate_name(self, value):
        """Validate tag name"""
        if not value or not value.strip():
            raise serializers.ValidationError("Tag name cannot be empty")
        return value.strip()

    def validate_color(self, value):
        """Validate color format"""
        import re

        if not re.match(r"^#[0-9A-Fa-f]{6}$", value):
            raise serializers.ValidationError("Invalid color format. Use #RRGGBB")
        return value


class TagUpdateSerializer(serializers.ModelSerializer):
    """Serializer for Tag update"""

    class Meta:
        model = Tag
        fields = ["name", "color"]

    def validate_name(self, value):
        """Validate tag name"""
        if not value or not value.strip():
            raise serializers.ValidationError("Tag name cannot be empty")
        return value.strip()

    def validate_color(self, value):
        """Validate color format"""
        import re

        if not re.match(r"^#[0-9A-Fa-f]{6}$", value):
            raise serializers.ValidationError("Invalid color format. Use #RRGGBB")
        return value


class AddTagsToVideoRequestSerializer(serializers.Serializer):
    """Request serializer for adding tags to video"""

    tag_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text="List of tag IDs to add to the video",
    )


class AddTagsToVideoResponseSerializer(serializers.Serializer):
    """Response serializer for adding tags to video"""

    message = serializers.CharField(help_text="Success message")
    added_count = serializers.IntegerField(help_text="Number of tags added")
    skipped_count = serializers.IntegerField(
        help_text="Number of tags skipped (already on video)"
    )
