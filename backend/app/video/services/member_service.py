"""
VideoGroupMember service operations
"""

from django.db.models import Max
from rest_framework import status
from rest_framework.response import Response

from app.common.responses import create_error_response
from app.models import VideoGroupMember


class VideoGroupMemberService:
    """Handles VideoGroupMember operations"""

    @staticmethod
    def get_member_queryset(group, video=None, select_related=False):
        """Get VideoGroupMember queryset"""
        queryset = VideoGroupMember.objects.filter(group=group)
        if video:
            queryset = queryset.filter(video=video)
        if select_related:
            queryset = queryset.select_related("video", "group")
        return queryset

    @staticmethod
    def member_exists(group, video):
        """Check if member exists"""
        return VideoGroupMemberService.get_member_queryset(group, video).exists()

    @staticmethod
    def check_and_get_member(
        group, video, error_message, status_code=status.HTTP_404_NOT_FOUND
    ):
        """Check member existence and retrieve"""
        member = VideoGroupMemberService.get_member_queryset(group, video).first()
        if not member:
            return None, create_error_response(error_message, status_code)
        return member, None

    @staticmethod
    def get_next_order(group):
        """Get next order value for new member"""
        max_order = (
            VideoGroupMemberService.get_member_queryset(group)
            .aggregate(max_order=Max("order"))
            .get("max_order")
        )
        return (max_order if max_order is not None else -1) + 1

    @staticmethod
    def add_video_to_group(group, video):
        """Add video to group operation"""
        if VideoGroupMemberService.get_member_queryset(group, video).first():
            return create_error_response(
                "This video is already added to the group", status.HTTP_400_BAD_REQUEST
            )

        next_order = VideoGroupMemberService.get_next_order(group)
        member = VideoGroupMember.objects.create(
            group=group, video=video, order=next_order
        )

        return Response(
            {"message": "Video added to group", "id": member.id},
            status=status.HTTP_201_CREATED,
        )
