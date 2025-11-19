"""
Database query optimization utilities (N+1 prevention)
"""

from typing import Any, Dict, List, Optional

from django.db.models import Count, Prefetch, QuerySet

from app.models import Video, VideoGroup, VideoGroupMember


class QueryOptimizer:
    """Database query optimization class (N+1 prevention)"""

    @staticmethod
    def optimize_video_queryset(
        queryset: QuerySet,
        include_user: bool = True,
        include_transcript: bool = False,
        include_groups: bool = False,
    ) -> QuerySet:
        """
        Optimize video queryset (N+1 prevention)

        Args:
            queryset: Base queryset
            include_user: Whether to include user information
            include_transcript: Whether to include transcript
            include_groups: Whether to include group information

        Returns:
            Optimized queryset
        """
        select_related_fields = []
        if include_user:
            select_related_fields.append("user")

        if select_related_fields:
            queryset = queryset.select_related(*select_related_fields)

        prefetch_fields = []
        if include_groups:
            prefetch_fields.append(
                Prefetch(
                    "groups",
                    queryset=VideoGroupMember.objects.select_related("group"),
                )
            )

        if include_transcript:
            queryset = queryset.only(
                "id",
                "title",
                "file",
                "status",
                "transcript",
                "uploaded_at",
                "user_id",
            )

        if prefetch_fields:
            queryset = queryset.prefetch_related(*prefetch_fields)

        return queryset

    @staticmethod
    def optimize_video_group_queryset(
        queryset: QuerySet,
        include_videos: bool = True,
        include_user: bool = True,
        annotate_video_count: bool = True,
    ) -> QuerySet:
        """
        Optimize video group queryset (N+1 prevention)

        Args:
            queryset: Base queryset
            include_videos: Whether to include video information
            include_user: Whether to include user information
            annotate_video_count: Whether to annotate video count

        Returns:
            Optimized queryset
        """
        if include_user:
            queryset = queryset.select_related("user")

        if include_videos:
            queryset = queryset.prefetch_related(
                Prefetch(
                    "members",
                    queryset=VideoGroupMember.objects.select_related("video"),
                )
            )

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
        Get videos with metadata (N+1 prevention)

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
        Get groups with videos (N+1 prevention)

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
    """Batch processing optimization class (N+1 prevention)"""

    @staticmethod
    def bulk_update_videos(videos: List[Video], fields: List[str]) -> int:
        """
        Batch update videos (N+1 prevention)

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
        Batch create video group members (N+1 prevention)

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
        Batch delete video group members (N+1 prevention)

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
    """Cache optimization class (N+1 prevention)"""

    @staticmethod
    def get_cached_video_data(video_ids: List[int]) -> Dict[int, Dict[str, Any]]:
        """
        Get video data from cache (N+1 prevention)

        Args:
            video_ids: List of video IDs

        Returns:
            Dictionary with video ID as key
        """
        if not video_ids:
            return {}

        # N+1 prevention: Get required data in a single query
        videos = (
            QueryOptimizer.get_videos_with_metadata(
                user_id=None, include_transcript=False
            )
            .filter(id__in=video_ids)
            .only("id", "title", "status", "uploaded_at", "user_id")
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
    def get_cached_video_group_data(group_ids: List[int]) -> Dict[int, Dict[str, Any]]:
        """
        Get video group data from cache (N+1 prevention)

        Args:
            group_ids: List of group IDs

        Returns:
            Dictionary with group ID as key
        """
        if not group_ids:
            return {}

        # N+1 prevention: Get required data in a single query
        # Note: video_count is an annotation, so we can't use only()
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

    @staticmethod
    def prefetch_related_data(
        queryset: QuerySet, related_fields: List[str]
    ) -> QuerySet:
        """
        Prefetch related data (N+1 prevention)

        Args:
            queryset: Base queryset
            related_fields: List of related fields to prefetch

        Returns:
            Optimized queryset
        """
        if not related_fields:
            return queryset

        return queryset.prefetch_related(*related_fields)

    @staticmethod
    def optimize_bulk_operations(queryset: QuerySet, operation_type: str) -> QuerySet:
        """
        Optimize queryset for bulk operations (N+1 prevention)

        Args:
            queryset: Base queryset
            operation_type: Operation type ('update', 'delete', 'create')

        Returns:
            Optimized queryset
        """
        if operation_type == "update":
            # Select only necessary fields for update operations
            return queryset.only("id")
        elif operation_type == "delete":
            # Select only ID for delete operations
            return queryset.only("id")
        elif operation_type == "create":
            # Keep default for create operations
            return queryset
        else:
            return queryset

    @staticmethod
    def get_optimized_count_queryset(
        model_class, filters: Optional[Dict[str, Any]] = None
    ) -> QuerySet:
        """
        Get optimized queryset for counting (N+1 prevention)

        Args:
            model_class: Model class
            filters: Filter conditions

        Returns:
            Optimized queryset
        """
        queryset = model_class.objects.only("id")
        if filters:
            queryset = queryset.filter(**filters)
        return queryset
