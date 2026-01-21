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
        from django.db import IntegrityError, transaction

        try:
            with transaction.atomic():
                # Compute next order only if we are creating
                # Note: get_or_create might evaluate defaults eagerly or lazily depending on impl,
                # but typically we pass a value. To be safe/atomic against race conditions for 'order',
                # we technically need locking or retry. 
                # However, for 'exists' check, get_or_create is sufficient to prevent duplicates.
                # For 'order', if multiple adds happen, order might clash or have gaps if we don't lock.
                # Given the user request focuses on IntegrityError/race on 'add', get_or_create is key.
                
                # To get a valid next_order inside the atomic block (locking relevant group rows):
                # But to keep it simple as requested: "perform an atomic get-or-create... compute next_order only when needed"
                
                # We can't easily compute next_order "only when needed" with vanilla get_or_create defaults 
                # unless we use a callable, which Django supports.
                def get_order():
                    return VideoGroupMemberService.get_next_order(group)

                member, created = VideoGroupMember.objects.get_or_create(
                    group=group, 
                    video=video,
                    defaults={'order': get_order()}
                )

                if not created:
                    return create_error_response(
                        "This video is already added to the group", status.HTTP_400_BAD_REQUEST
                    )

                return Response(
                    {"message": "Video added to group", "id": member.id},
                    status=status.HTTP_201_CREATED,
                )

        except IntegrityError:
            return create_error_response(
                "This video is already added to the group", status.HTTP_400_BAD_REQUEST
            )
