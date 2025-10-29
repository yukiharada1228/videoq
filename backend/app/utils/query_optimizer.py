"""
データベースクエリ最適化ユーティリティ（N+1問題対策）
"""

from typing import Any, Dict, List, Optional, Union

from app.models import Video, VideoGroup, VideoGroupMember
from django.db.models import Count, Prefetch, QuerySet


class QueryOptimizer:
    """データベースクエリの最適化クラス（N+1問題対策）"""

    @staticmethod
    def optimize_video_queryset(
        queryset: QuerySet,
        include_user: bool = True,
        include_transcript: bool = False,
        include_groups: bool = False,
    ) -> QuerySet:
        """
        動画クエリセットを最適化（N+1問題対策）

        Args:
            queryset: ベースとなるクエリセット
            include_user: ユーザー情報を含めるか
            include_transcript: 文字起こしを含めるか
            include_groups: グループ情報を含めるか

        Returns:
            最適化されたクエリセット
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
        動画グループクエリセットを最適化（N+1問題対策）

        Args:
            queryset: ベースとなるクエリセット
            include_videos: 動画情報を含めるか
            include_user: ユーザー情報を含めるか
            annotate_video_count: 動画数をアノテートするか

        Returns:
            最適化されたクエリセット
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
        メタデータ付きで動画を取得（N+1問題対策）

        Args:
            user_id: ユーザーID
            include_transcript: 文字起こしを含めるか
            status_filter: ステータスフィルター
            include_groups: グループ情報を含めるか

        Returns:
            最適化された動画クエリセット
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
        動画付きでグループを取得（N+1問題対策）

        Args:
            user_id: ユーザーID

        Returns:
            最適化されたグループクエリセット
        """
        queryset = VideoGroup.objects.filter(user_id=user_id)

        return QueryOptimizer.optimize_video_group_queryset(
            queryset,
            include_videos=include_videos,
            include_user=True,
            annotate_video_count=annotate_video_count,
        ).order_by("-created_at")


class BatchProcessor:
    """バッチ処理の最適化クラス（N+1問題対策）"""

    @staticmethod
    def bulk_update_videos(videos: List[Video], fields: List[str]) -> int:
        """
        動画をバッチ更新（N+1問題対策）

        Args:
            videos: 更新する動画のリスト
            fields: 更新するフィールドのリスト

        Returns:
            更新されたレコード数
        """
        if not videos:
            return 0

        return Video.objects.bulk_update(videos, fields)

    @staticmethod
    def bulk_create_video_group_members(
        group_id: int, video_ids: List[int], orders: Optional[List[int]] = None
    ) -> List[VideoGroupMember]:
        """
        動画グループメンバーをバッチ作成（N+1問題対策）

        Args:
            group_id: グループID
            video_ids: 動画IDのリスト
            orders: 順序のリスト（オプション）

        Returns:
            作成されたメンバーのリスト
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
        動画グループメンバーをバッチ削除（N+1問題対策）

        Args:
            group_id: グループID
            video_ids: 削除する動画IDのリスト

        Returns:
            削除されたレコード数
        """
        if not video_ids:
            return 0

        count, _ = VideoGroupMember.objects.filter(
            group_id=group_id, video_id__in=video_ids
        ).delete()
        return count


class CacheOptimizer:
    """キャッシュ最適化クラス（N+1問題対策）"""

    @staticmethod
    def get_cached_video_data(video_ids: List[int]) -> Dict[int, Dict[str, Any]]:
        """
        動画データをキャッシュから取得（N+1問題対策）
        
        Args:
            video_ids: 動画IDのリスト
            
        Returns:
            動画IDをキーとしたデータ辞書
        """
        if not video_ids:
            return {}

        # N+1問題対策: 一度のクエリで必要なデータを取得
        videos = QueryOptimizer.get_videos_with_metadata(
            user_id=None, include_transcript=False
        ).filter(id__in=video_ids).only(
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
    def get_cached_video_group_data(group_ids: List[int]) -> Dict[int, Dict[str, Any]]:
        """
        動画グループデータをキャッシュから取得（N+1問題対策）
        
        Args:
            group_ids: グループIDのリスト
            
        Returns:
            グループIDをキーとしたデータ辞書
        """
        if not group_ids:
            return {}

        # N+1問題対策: 一度のクエリで必要なデータを取得
        groups = VideoGroup.objects.filter(
            id__in=group_ids
        ).select_related("user").annotate(
            video_count=Count("members__video", distinct=True)
        ).only(
            "id", "name", "description", "created_at", "user_id", "video_count"
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
        関連データを事前取得（N+1問題対策）
        
        Args:
            queryset: ベースとなるクエリセット
            related_fields: 事前取得する関連フィールドのリスト
            
        Returns:
            最適化されたクエリセット
        """
        if not related_fields:
            return queryset
        
        return queryset.prefetch_related(*related_fields)

    @staticmethod
    def optimize_bulk_operations(queryset: QuerySet, operation_type: str) -> QuerySet:
        """
        バルク操作用のクエリセットを最適化（N+1問題対策）
        
        Args:
            queryset: ベースとなるクエリセット
            operation_type: 操作タイプ（'update', 'delete', 'create'）
            
        Returns:
            最適化されたクエリセット
        """
        if operation_type == 'update':
            # 更新操作では必要なフィールドのみを選択
            return queryset.only('id')
        elif operation_type == 'delete':
            # 削除操作ではIDのみを選択
            return queryset.only('id')
        elif operation_type == 'create':
            # 作成操作ではデフォルトのまま
            return queryset
        else:
            return queryset

    @staticmethod
    def get_optimized_count_queryset(model_class, filters: dict = None) -> QuerySet:
        """
        カウント用の最適化されたクエリセットを取得（N+1問題対策）
        
        Args:
            model_class: モデルクラス
            filters: フィルター条件
            
        Returns:
            最適化されたクエリセット
        """
        queryset = model_class.objects.only('id')
        if filters:
            queryset = queryset.filter(**filters)
        return queryset
