"""
Resource validation and retrieval logic
"""

from rest_framework import status

from app.common.responses import create_error_response
from app.models import Video, VideoGroup


class ResourceValidator:
    """Handles validation and resource retrieval logic"""

    @staticmethod
    def validate_and_get_resource(
        user, model_class, resource_id, entity_name, select_related_fields=None
    ):
        """Common resource retrieval and validation logic"""
        queryset = model_class.objects.filter(user=user, id=resource_id)

        if select_related_fields:
            queryset = queryset.select_related(*select_related_fields)

        resource = queryset.first()

        if not resource:
            return None, create_error_response(
                f"{entity_name} not found", status.HTTP_404_NOT_FOUND
            )

        return resource, None

    @staticmethod
    def get_group_and_video(user, group_id, video_id, select_related_fields=None):
        """Common group and video retrieval logic"""
        group, error = ResourceValidator.validate_and_get_resource(
            user, VideoGroup, group_id, "Group", select_related_fields
        )
        if error:
            return None, None, error

        video, error = ResourceValidator.validate_and_get_resource(
            user, Video, video_id, "Video", select_related_fields
        )
        if error:
            return None, None, error

        return group, video, None

    @staticmethod
    def validate_video_ids(request, entity_name):
        """Validate video_ids from request"""
        video_ids = request.data.get("video_ids", [])
        if not video_ids:
            return None, create_error_response(
                f"{entity_name} ID not specified", status.HTTP_400_BAD_REQUEST
            )
        return video_ids, None

    @staticmethod
    def validate_videos_count(videos, video_ids):
        """Check video count matches"""
        if len(videos) != len(video_ids):
            return create_error_response(
                "Some videos not found", status.HTTP_404_NOT_FOUND
            )
        return None
