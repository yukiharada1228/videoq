"""
Database query optimization utilities
"""

from typing import Any, Dict, List, Optional

from django.db.models import Count, Prefetch, QuerySet

from app.models import Video, VideoGroup, VideoGroupMember


class QueryOptimizer:
    """Database query optimization class"""

    @staticmethod
    def _apply_select_related(queryset: QuerySet, fields: List[str]) -> QuerySet:
        """Apply select_related if fields are provided"""
        return queryset.select_related(*fields) if fields else queryset

    @staticmethod
    def _apply_prefetch_related(queryset: QuerySet, prefetch_objects: List) -> QuerySet:
        """Apply prefetch_related if objects are provided"""
        return (
            queryset.prefetch_related(*prefetch_objects)
            if prefetch_objects
            else queryset
        )

    @staticmethod
    def optimize_video_queryset(
        queryset: QuerySet,
        include_user: bool = True,
        include_transcript: bool = False,
        include_groups: bool = False,
    ) -> QuerySet:
        """
        Optimize video queryset

        Args:
            queryset: Base queryset
            include_user: Whether to include user information
            include_transcript: Whether to include transcript
            include_groups: Whether to include group information

        Returns:
            Optimized queryset
        """
        # Select related fields
        select_fields = ["user"] if include_user else []
        queryset = QueryOptimizer._apply_select_related(queryset, select_fields)

        # Prefetch related fields
        prefetch_objects = []
        if include_groups:
            prefetch_objects.append(
                Prefetch(
                    "groups", queryset=VideoGroupMember.objects.select_related("group")
                )
            )
        queryset = QueryOptimizer._apply_prefetch_related(queryset, prefetch_objects)

        # Optimize field selection
        if include_transcript:
            queryset = queryset.only(
                "id", "title", "file", "status", "transcript", "uploaded_at", "user_id"
            )

        return queryset

    @staticmethod
    def optimize_video_group_queryset(
        queryset: QuerySet,
        include_videos: bool = True,
        include_user: bool = True,
        annotate_video_count: bool = True,
    ) -> QuerySet:
        """
        Optimize video group queryset

        Args:
            queryset: Base queryset
            include_videos: Whether to include video information
            include_user: Whether to include user information
            annotate_video_count: Whether to annotate video count

        Returns:
            Optimized queryset
        """
        # Select related user
        if include_user:
            queryset = queryset.select_related("user")

        # Prefetch related videos
        if include_videos:
            queryset = queryset.prefetch_related(
                Prefetch(
                    "members", queryset=VideoGroupMember.objects.select_related("video")
                )
            )

        # Annotate video count
        if annotate_video_count:
            queryset = queryset.annotate(
                video_count=Count("members__video", distinct=True)
            )

        return queryset

    @staticmethod
    def get_videos_with_metadata(
        user_id: Optional[int],
        include_transcript: bool = False,
        status_filter: Optional[str] = None,
        include_groups: bool = False,
    ) -> QuerySet:
        """
        Get videos with metadata
        Excludes deleted videos from normal queries

        Args:
            user_id: User ID
            include_transcript: Whether to include transcript
            status_filter: Status filter
            include_groups: Whether to include group information

        Returns:
            Optimized video queryset
        """
        if user_id is not None:
            queryset = Video.objects.filter(user_id=user_id)
        else:
            queryset = Video.objects.all()

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        queryset = QueryOptimizer.optimize_video_queryset(
            queryset,
            include_user=True,
            include_transcript=include_transcript,
            include_groups=include_groups,
        )

        return queryset.order_by("-uploaded_at")

    @staticmethod
    def get_video_groups_with_videos(
        user_id: int,
        include_videos: bool = True,
        annotate_video_count: bool = True,
    ) -> QuerySet:
        """
        Get groups with videos

        Args:
            user_id: User ID

        Returns:
            Optimized group queryset
        """
        queryset = VideoGroup.objects.filter(user_id=user_id)

        return QueryOptimizer.optimize_video_group_queryset(
            queryset,
            include_videos=include_videos,
            include_user=True,
            annotate_video_count=annotate_video_count,
        ).order_by("-created_at")


class BatchProcessor:
    """Batch processing optimization class"""

    @staticmethod
    def bulk_update_videos(videos: List[Video], fields: List[str]) -> int:
        """
        Batch update videos

        Args:
            videos: List of videos to update
            fields: List of fields to update

        Returns:
            Number of updated records
        """
        if not videos:
            return 0

        return Video.objects.bulk_update(videos, fields)

    @staticmethod
    def bulk_create_video_group_members(
        group_id: int, video_ids: List[int], orders: Optional[List[int]] = None
    ) -> List[VideoGroupMember]:
        """
        Batch create video group members

        Args:
            group_id: Group ID
            video_ids: List of video IDs
            orders: List of orders (optional)

        Returns:
            List of created members
        """
        if not video_ids:
            return []

        if orders is None:
            orders = list(range(len(video_ids)))

        members = [
            VideoGroupMember(group_id=group_id, video_id=video_id, order=order)
            for video_id, order in zip(video_ids, orders)
        ]

        return VideoGroupMember.objects.bulk_create(members)

    @staticmethod
    def bulk_delete_video_group_members(group_id: int, video_ids: List[int]) -> int:
        """
        Batch delete video group members

        Args:
            group_id: Group ID
            video_ids: List of video IDs to delete

        Returns:
            Number of deleted records
        """
        if not video_ids:
            return 0

        count, _ = VideoGroupMember.objects.filter(
            group_id=group_id, video_id__in=video_ids
        ).delete()
        return count


class CacheOptimizer:
    """Utilities for optimized data retrieval"""

    @staticmethod
    def get_video_data_by_ids(video_ids: List[int]) -> Dict[int, Dict[str, Any]]:
        """
        Get optimized video data by IDs

        Args:
            video_ids: List of video IDs

        Returns:
            Dictionary with video ID as key
        """
        if not video_ids:
            return {}

        videos = Video.objects.filter(id__in=video_ids).only(
            "id", "title", "status", "uploaded_at", "user_id"
        )

        return {
            video.id: {
                "title": video.title,
                "status": video.status,
                "uploaded_at": video.uploaded_at,
                "user_id": video.user_id,
            }
            for video in videos
        }

    @staticmethod
    def get_group_data_by_ids(group_ids: List[int]) -> Dict[int, Dict[str, Any]]:
        """
        Get optimized video group data by IDs

        Args:
            group_ids: List of group IDs

        Returns:
            Dictionary with group ID as key
        """
        if not group_ids:
            return {}

        groups = (
            VideoGroup.objects.filter(id__in=group_ids)
            .select_related("user")
            .annotate(video_count=Count("members__video", distinct=True))
        )

        return {
            group.id: {
                "name": group.name,
                "description": group.description,
                "created_at": group.created_at,
                "user_id": group.user_id,
                "video_count": group.video_count,
            }
            for group in groups
        }
