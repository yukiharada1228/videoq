import json
import logging
import os
import subprocess
import tempfile

from rest_framework import serializers

from app.models import Video, VideoGroup
from app.tasks import transcribe_video
from app.utils.plan_limits import (get_monthly_whisper_usage, get_video_limit,
                                   get_whisper_minutes_limit)

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

        if user:
            # Check video limit based on user's plan
            # Exclude deleted videos from count
            video_limit = get_video_limit(user)
            current_count = Video.objects.filter(
                user=user, deleted_at__isnull=True
            ).count()
            if current_count >= video_limit:
                raise serializers.ValidationError(
                    {
                        "detail": f"Video limit reached ({video_limit} videos). Please delete unnecessary videos or upgrade your plan."
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
            if video_duration_minutes is None:
                # If we cannot determine video duration, we cannot check the limit
                # Delete the video record and reject the upload to prevent bypassing the limit
                video.delete()
                raise serializers.ValidationError(
                    {
                        "detail": "Failed to determine video duration. Please ensure the video file is valid and try again. If the problem persists, contact support."
                    }
                )

            # Check monthly Whisper usage limit
            monthly_whisper_usage = get_monthly_whisper_usage(
                user, exclude_video_id=video.id
            )

            # Check if adding this video would exceed the limit (based on user's plan)
            whisper_limit = get_whisper_minutes_limit(user)
            if monthly_whisper_usage + video_duration_minutes > whisper_limit:
                # Delete the video record if limit exceeded
                video.delete()
                whisper_limit_hours = whisper_limit / 60.0
                raise serializers.ValidationError(
                    {
                        "detail": f"Monthly Whisper usage limit reached ({whisper_limit_hours:.1f} hours = {whisper_limit:.1f} minutes per month). Current usage: {monthly_whisper_usage:.1f} minutes. This video would add {video_duration_minutes:.1f} minutes. Please try again next month or upgrade your plan."
                    }
                )

            # Save duration to video record
            video.duration_minutes = video_duration_minutes
            video.save(update_fields=["duration_minutes"])
        except serializers.ValidationError:
            # Re-raise ValidationError so it's properly handled by the serializer
            raise
        except Exception as e:
            # For other exceptions (e.g., database errors), log and reject upload
            logger.error(
                f"Failed to check video duration or Whisper limit: {e}", exc_info=True
            )
            video.delete()
            raise serializers.ValidationError(
                {
                    "detail": "An error occurred while processing your video. Please try again later."
                }
            )

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
    """Serializer for Video list"""

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
