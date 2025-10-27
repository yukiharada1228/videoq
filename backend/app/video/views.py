from app.models import Video, VideoGroup, VideoGroupMember
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes

from .serializers import (
    VideoCreateSerializer,
    VideoGroupCreateSerializer,
    VideoGroupDetailSerializer,
    VideoGroupListSerializer,
    VideoGroupUpdateSerializer,
    VideoListSerializer,
    VideoSerializer,
    VideoUpdateSerializer,
)


class BaseVideoView:
    """共通のVideoビュー基底クラス（DRY原則）"""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """現在のユーザーのVideoのみを返す共通ロジック（DRY原則）"""
        return Video.objects.filter(user=self.request.user)


class VideoListView(BaseVideoView, generics.ListCreateAPIView):
    """Video一覧取得・作成ビュー"""

    def get_serializer_class(self):
        """リクエストのメソッドに応じてシリアライザーを変更"""
        if self.request.method == "POST":
            return VideoCreateSerializer
        return VideoListSerializer


class VideoDetailView(BaseVideoView, generics.RetrieveUpdateDestroyAPIView):
    """Video詳細・更新・削除ビュー"""

    def get_queryset(self):
        """N+1問題対策: シリアライザーにuserを含めているため、select_relatedが必要"""
        return super().get_queryset().select_related("user")

    def get_serializer_class(self):
        """リクエストのメソッドに応じてシリアライザーを変更"""
        if self.request.method == "GET":
            return VideoSerializer
        if self.request.method in ["PUT", "PATCH"]:
            return VideoUpdateSerializer
        return VideoSerializer

    def destroy(self, request, *args, **kwargs):
        """Video削除時にファイルも削除"""
        instance = self.get_object()
        # ファイルが存在する場合は削除
        if instance.file:
            instance.file.delete(save=False)
        return super().destroy(request, *args, **kwargs)


class BaseVideoGroupView:
    """共通のVideoGroupビュー基底クラス"""

    permission_classes = [IsAuthenticated]


class BaseVideoGroupListView:
    """VideoGroupList用の基底クラス（N+1問題対策）"""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """現在のユーザーのVideoGroupのみを返す（N+1問題対策）"""
        from django.db.models import Count
        return VideoGroup.objects.filter(
            user=self.request.user
        ).annotate(
            video_count=Count('members__video')
        )


class BaseVideoGroupDetailView:
    """VideoGroupDetail用の基底クラス（N+1問題対策）"""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """現在のユーザーのVideoGroupのみを返す（N+1問題対策）"""
        from django.db.models import Count, Prefetch
        return VideoGroup.objects.filter(
            user=self.request.user
        ).annotate(
            video_count=Count('members__video')
        ).prefetch_related(
            Prefetch('members', queryset=VideoGroupMember.objects.select_related('video'))
        )


class VideoGroupListView(BaseVideoGroupListView, generics.ListCreateAPIView):
    """VideoGroup一覧取得・作成ビュー"""

    def get_serializer_class(self):
        """リクエストのメソッドに応じてシリアライザーを変更"""
        if self.request.method == "POST":
            return VideoGroupCreateSerializer
        return VideoGroupListSerializer


class VideoGroupDetailView(BaseVideoGroupDetailView, generics.RetrieveUpdateDestroyAPIView):
    """VideoGroup詳細・更新・削除ビュー"""

    def get_serializer_class(self):
        """リクエストのメソッドに応じてシリアライザーを変更"""
        if self.request.method == "GET":
            return VideoGroupDetailSerializer
        if self.request.method in ["PUT", "PATCH"]:
            return VideoGroupUpdateSerializer
        return VideoGroupDetailSerializer


def _get_group_and_video(user, group_id, video_id):
    """共通のグループとビデオ取得ロジック（DRY原則）"""
    group = VideoGroup.objects.filter(user=user, id=group_id).first()
    video = Video.objects.filter(user=user, id=video_id).first()
    return group, video


def _create_error_response(error_message: str, http_status: int = status.HTTP_404_NOT_FOUND):
    """共通のエラーレスポンス生成ロジック（DRY原則）"""
    return Response({"error": error_message}, status=http_status)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_video_to_group(request, group_id, video_id):
    """グループに動画を追加"""
    try:
        group, video = _get_group_and_video(request.user, group_id, video_id)
        
        if not group:
            return _create_error_response("グループが見つかりません")
        
        if not video:
            return _create_error_response("動画が見つかりません")
        
        # すでに追加されているかチェック
        if VideoGroupMember.objects.filter(group=group, video=video).exists():
            return _create_error_response(
                "この動画は既にグループに追加されています",
                status.HTTP_400_BAD_REQUEST
            )
        
        # グループに追加
        member = VideoGroupMember.objects.create(group=group, video=video)
        
        return Response({
            "message": "動画をグループに追加しました",
            "id": member.id
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        return _create_error_response(str(e), status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_videos_to_group(request, group_id):
    """グループに複数の動画を追加（N+1問題対策）"""
    try:
        group = VideoGroup.objects.filter(user=request.user, id=group_id).first()
        
        if not group:
            return _create_error_response("グループが見つかりません")
        
        video_ids = request.data.get('video_ids', [])
        if not video_ids:
            return _create_error_response(
                "動画IDが指定されていません",
                status.HTTP_400_BAD_REQUEST
            )
        
        # 動画を一括取得（N+1問題対策）
        videos = list(Video.objects.filter(user=request.user, id__in=video_ids))
        
        if len(videos) != len(video_ids):
            return _create_error_response(
                "一部の動画が見つかりません",
                status.HTTP_404_NOT_FOUND
            )
        
        # 既に追加されている動画をチェック（N+1問題対策）
        existing_members = set(VideoGroupMember.objects.filter(
            group=group,
            video__in=videos
        ).values_list('video_id', flat=True))
        
        # 追加可能な動画のみをフィルタリング（N+1問題対策）
        videos_to_add = [video for video in videos if video.id not in existing_members]
        
        # バッチで追加
        members_to_create = [
            VideoGroupMember(group=group, video=video)
            for video in videos_to_add
        ]
        VideoGroupMember.objects.bulk_create(members_to_create)
        
        added_count = len(members_to_create)
        skipped_count = len(video_ids) - added_count
        
        return Response({
            "message": f"{added_count}個の動画をグループに追加しました",
            "added_count": added_count,
            "skipped_count": skipped_count
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        return _create_error_response(str(e), status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def remove_video_from_group(request, group_id, video_id):
    """グループから動画を削除"""
    try:
        group, video = _get_group_and_video(request.user, group_id, video_id)
        
        if not group:
            return _create_error_response("グループが見つかりません")
        
        if not video:
            return _create_error_response("動画が見つかりません")
        
        # グループメンバーを削除
        member = VideoGroupMember.objects.filter(group=group, video=video).first()
        if not member:
            return _create_error_response("この動画はグループに追加されていません")
        
        member.delete()
        
        return Response({
            "message": "動画をグループから削除しました"
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return _create_error_response(str(e), status.HTTP_500_INTERNAL_SERVER_ERROR)
