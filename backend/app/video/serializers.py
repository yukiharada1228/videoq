import logging

from rest_framework import serializers

from app.models import Video, VideoGroup
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
        ]
        read_only_fields = ["id", "user", "uploaded_at"]


class VideoCreateSerializer(UserOwnedSerializerMixin, serializers.ModelSerializer):
    """Serializer for Video creation"""

    delete_after_processing = serializers.BooleanField(
        default=False,
        required=False,
        write_only=True,
        help_text="If true, delete video file after transcription is complete. Only transcript will be kept.",
    )

    class Meta:
        model = Video
        fields = ["file", "title", "description", "delete_after_processing", "external_id"]

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
        # Extract delete_after_processing flag (not saved to model)
        delete_after_processing = validated_data.pop("delete_after_processing", False)

        # Create Video instance
        video = super().create(validated_data)

        # Set flag if user requested file deletion after processing
        if delete_after_processing:
            video.is_external_upload = True
            video.save(update_fields=["is_external_upload"])
            logger.info(
                f"Video ID {video.id} will be deleted after processing (delete_after_processing=true)."
            )

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

    class Meta:
        model = Video
        fields = ["id", "file", "title", "description", "uploaded_at", "status", "external_id"]
        read_only_fields = ["id", "uploaded_at"]


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
