import json
import logging
import os
import subprocess
import tempfile

from app.models import Video, VideoGroup
from app.tasks import transcribe_video
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

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
        ]
        read_only_fields = ["id", "user", "uploaded_at"]


class VideoCreateSerializer(UserOwnedSerializerMixin, serializers.ModelSerializer):
    """Serializer for Video creation"""

    class Meta:
        model = Video
        fields = ["file", "title", "description"]

    def create(self, validated_data):
        """Start transcription task when Video is created"""
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if user and getattr(user, "video_limit", None) is not None:
            current_count = Video.objects.filter(user=user).count()
            if current_count >= user.video_limit:
                raise serializers.ValidationError(
                    {
                        "detail": "Video limit reached. Please delete unnecessary videos or contact an administrator to change the limit."
                    }
                )

        # Check if Authorization header exists (determine external API client)
        is_external_client = request and request.META.get("HTTP_AUTHORIZATION")

        # Create Video instance
        video = super().create(validated_data)

        # Set flag if from external API client
        if is_external_client:
            video.is_external_upload = True
            video.save(update_fields=["is_external_upload"])
            logger.info(
                f"External API client upload detected for video ID: {video.id}. File will be deleted after processing."
            )

        # Check Whisper monthly usage limit (1,200 minutes = 20 hours)
        try:
            video_duration_minutes = self._get_video_duration_minutes(video)
            if video_duration_minutes is not None:
                # Check monthly Whisper usage limit
                now = timezone.now()
                first_day_of_month = now.replace(
                    day=1, hour=0, minute=0, second=0, microsecond=0
                )

                # Sum duration_minutes for all videos (pending, processing, completed) in current month
                # This includes videos that are being processed or already completed
                monthly_whisper_usage = (
                    Video.objects.filter(
                        user=user,
                        uploaded_at__gte=first_day_of_month,
                        duration_minutes__isnull=False,
                    )
                    .exclude(id=video.id)
                    .aggregate(total_minutes=Sum("duration_minutes"))["total_minutes"]
                    or 0.0
                )

                # Check if adding this video would exceed the limit
                if monthly_whisper_usage + video_duration_minutes > 1200:
                    # Delete the video record if limit exceeded
                    video.delete()
                    raise serializers.ValidationError(
                        {
                            "detail": f"Monthly Whisper usage limit reached (20 hours = 1,200 minutes per month). Current usage: {monthly_whisper_usage:.1f} minutes. This video would add {video_duration_minutes:.1f} minutes. Please try again next month."
                        }
                    )

                # Save duration to video record
                video.duration_minutes = video_duration_minutes
                video.save(update_fields=["duration_minutes"])
        except Exception as e:
            logger.warning(f"Failed to check video duration or Whisper limit: {e}")
            # Continue with transcription even if duration check fails
            # Duration will be saved in the transcription task

        # Execute Celery task asynchronously
        logger.info(f"Starting transcription task for video ID: {video.id}")
        try:
            task = transcribe_video.delay(video.id)
            logger.info(f"Transcription task created with ID: {task.id}")
        except Exception as e:
            logger.error(f"Failed to start transcription task: {e}")

        return video

    def _get_video_duration_minutes(self, video):
        """Get video duration in minutes using ffprobe"""
        try:
            # Get video file path
            try:
                video_path = video.file.path
            except (NotImplementedError, AttributeError):
                # S3 storage case - download temporarily
                temp_path = tempfile.NamedTemporaryFile(
                    delete=False, suffix=os.path.splitext(video.file.name)[1]
                )
                with video.file.open("rb") as remote_file:
                    temp_path.write(remote_file.read())
                temp_path.close()
                video_path = temp_path.name
                is_temp = True
            else:
                is_temp = False

            # Get video duration using ffprobe
            probe_result = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "quiet",
                    "-print_format",
                    "json",
                    "-show_format",
                    video_path,
                ],
                capture_output=True,
                text=True,
                check=True,
            )
            probe = json.loads(probe_result.stdout)
            duration_seconds = float(probe["format"]["duration"])
            duration_minutes = duration_seconds / 60.0

            # Clean up temporary file if needed
            if is_temp:
                os.unlink(video_path)

            return duration_minutes
        except Exception as e:
            logger.warning(f"Failed to get video duration: {e}")
            return None


class VideoUpdateSerializer(serializers.ModelSerializer):
    """Serializer for Video update"""

    class Meta:
        model = Video
        fields = ["title", "description"]


class VideoListSerializer(serializers.ModelSerializer):
    """Serializer for Video list
    Note: select_related('user') not needed in VideoListView for N+1 prevention
    since user field is not included
    """

    class Meta:
        model = Video
        fields = ["id", "file", "title", "description", "uploaded_at", "status"]
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
        # N+1 prevention: Use members already fetched with prefetch_related (no additional query)
        # Use list() to evaluate (avoid lazy evaluation)
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

        # Add order information and return (N+1 prevention: O(n) lookup)
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
