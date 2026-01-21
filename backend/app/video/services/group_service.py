from django.db.models import Prefetch

from app.models import VideoGroup, VideoGroupMember


class VideoGroupService:
    """Service for VideoGroup operations"""

    @staticmethod
    def get_video_group_with_members(group_id, user_id=None, share_token=None):
        """
        Get group and member information

        Args:
            group_id: Group ID
            user_id: User ID (optional)
            share_token: Share token (optional)

        Returns:
            VideoGroup: Group object
        """
        queryset = VideoGroup.objects.select_related("user").prefetch_related(
            Prefetch(
                "members",
                queryset=VideoGroupMember.objects.select_related("video"),
            )
        )

        if share_token:
            return queryset.get(id=group_id, share_token=share_token)
        elif user_id:
            return queryset.get(id=group_id, user_id=user_id)
        else:
            return queryset.get(id=group_id)
