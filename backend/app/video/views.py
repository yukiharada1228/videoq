from app.models import Video, VideoGroup, VideoGroupMember
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .serializers import (VideoCreateSerializer, VideoGroupCreateSerializer,
                          VideoGroupDetailSerializer, VideoGroupListSerializer,
                          VideoGroupUpdateSerializer, VideoListSerializer,
                          VideoSerializer, VideoUpdateSerializer)


class DynamicSerializerMixin:
    """動的にシリアライザーを切り替える共通ミックスイン（DRY原則）"""

    def get_serializer_class(self):
        """リクエストのメソッドに応じてシリアライザーを変更"""
        if not hasattr(self, "serializer_map") or not self.serializer_map:
            # serializer_mapがない場合は、従来の方法を試す
            if hasattr(self, "serializer_class") and self.serializer_class:
                return self.serializer_class
            return super().get_serializer_class()

        method = self.request.method
        serializer_class = self.serializer_map.get(method)

        if serializer_class:
            return serializer_class

        # マッチしない場合はデフォルト（最初の値）を使用
        return next(iter(self.serializer_map.values()))


class AuthenticatedViewMixin:
    """認証必須の共通ミックスイン（DRY原則）"""

    permission_classes = [IsAuthenticated]

    def get_serializer_context(self):
        """シリアライザーにリクエストコンテキストを渡す（DRY原則）"""
        context = super().get_serializer_context()
        context["request"] = self.request
        return context


class BaseVideoView(AuthenticatedViewMixin):
    """共通のVideoビュー基底クラス（DRY原則）"""

    def get_queryset(self):
        """現在のユーザーのVideoのみを返す共通ロジック（DRY原則）"""
        return Video.objects.filter(user=self.request.user)


class VideoListView(DynamicSerializerMixin, BaseVideoView, generics.ListCreateAPIView):
    """Video一覧取得・作成ビュー

    N+1問題対策:
    - VideoListSerializerにuserを含めていないため、select_relatedは不要
    - 将来的に追加の関連データが必要な場合はget_queryset()をオーバーライド可能
    """

    # DRY原則: シリアライザーマッピング
    serializer_map = {
        "GET": VideoListSerializer,
        "POST": VideoCreateSerializer,
    }


class VideoDetailView(
    DynamicSerializerMixin, BaseVideoView, generics.RetrieveUpdateDestroyAPIView
):
    """Video詳細・更新・削除ビュー"""

    # DRY原則: シリアライザーマッピング
    serializer_map = {
        "GET": VideoSerializer,
        "PUT": VideoUpdateSerializer,
        "PATCH": VideoUpdateSerializer,
    }

    def get_queryset(self):
        """N+1問題対策: シリアライザーにuserを含めているため、select_relatedが必要"""
        return super().get_queryset().select_related("user")

    def destroy(self, request, *args, **kwargs):
        """Video削除時にファイルも削除"""
        instance = self.get_object()
        # ファイルが存在する場合は削除
        if instance.file:
            instance.file.delete(save=False)
        return super().destroy(request, *args, **kwargs)


class BaseVideoGroupView(AuthenticatedViewMixin):
    """共通のVideoGroupビュー基底クラス（DRY原則）"""

    def _get_filtered_queryset(self, annotate_only=False):
        """共通のクエリ取得ロジック（DRY原則・N+1問題対策）"""
        from django.db.models import Count, Prefetch

        queryset = VideoGroup.objects.filter(user=self.request.user).annotate(
            video_count=Count("members__video")
        )

        # 詳細表示の場合はprefetch_relatedを追加
        if not annotate_only:
            queryset = queryset.prefetch_related(
                Prefetch(
                    "members", queryset=VideoGroupMember.objects.select_related("video")
                )
            )

        return queryset


class VideoGroupListView(
    DynamicSerializerMixin, BaseVideoGroupView, generics.ListCreateAPIView
):
    """VideoGroup一覧取得・作成ビュー（N+1問題対策）"""

    # DRY原則: シリアライザーマッピング
    serializer_map = {
        "GET": VideoGroupListSerializer,
        "POST": VideoGroupCreateSerializer,
    }

    def get_queryset(self):
        """現在のユーザーのVideoGroupのみを返す（N+1問題対策）"""
        return self._get_filtered_queryset(annotate_only=True)


class VideoGroupDetailView(
    DynamicSerializerMixin, BaseVideoGroupView, generics.RetrieveUpdateDestroyAPIView
):
    """VideoGroup詳細・更新・削除ビュー（N+1問題対策）"""

    # DRY原則: シリアライザーマッピング
    serializer_map = {
        "GET": VideoGroupDetailSerializer,
        "PUT": VideoGroupUpdateSerializer,
        "PATCH": VideoGroupUpdateSerializer,
    }

    def get_queryset(self):
        """現在のユーザーのVideoGroupのみを返す（N+1問題対策）"""
        return self._get_filtered_queryset(annotate_only=False)


def _create_error_response(
    error_message: str, http_status: int = status.HTTP_404_NOT_FOUND
):
    """共通のエラーレスポンス生成ロジック（DRY原則）"""
    return Response({"error": error_message}, status=http_status)


def _handle_validation_error(value, field_name: str, entity_name: str):
    """共通のバリデーションチェック（DRY原則）"""
    if not value:
        return _create_error_response(f"{entity_name}が見つかりません")
    return None


def _get_group_and_video(user, group_id, video_id):
    """共通のグループとビデオ取得ロジック（DRY原則・N+1問題対策）"""
    # N+1問題対策: get()を使用して効率化
    try:
        group = VideoGroup.objects.get(user=user, id=group_id)
        video = Video.objects.get(user=user, id=video_id)
        return group, video
    except (VideoGroup.DoesNotExist, Video.DoesNotExist):
        return None, None


def _validate_ownership(user, resource, entity_name: str):
    """共通の所有権検証ロジック（DRY原則）"""
    error = _handle_validation_error(resource, entity_name, entity_name)
    if error:
        return error
    if resource.user != user:
        return _create_error_response(
            f"この{entity_name}にアクセスする権限がありません",
            status.HTTP_403_FORBIDDEN,
        )
    return None


def _validate_user_owns_group(user, group):
    """グループ所有権検証（DRY原則）"""
    return _validate_ownership(user, group, "グループ")


def _validate_user_owns_video(user, video):
    """ビデオ所有権検証（DRY原則）"""
    return _validate_ownership(user, video, "動画")


# DRY原則: 認証必須APIビューデコレーター
def authenticated_api_view(methods):
    """認証必須のAPIビューデコレーター（DRY原則）"""

    def decorator(view_func):
        return permission_classes([IsAuthenticated])(api_view(methods)(view_func))

    return decorator


@authenticated_api_view(["POST"])
def add_video_to_group(request, group_id, video_id):
    """グループに動画を追加（DRY原則・N+1問題対策）"""
    try:
        group, video = _get_group_and_video(request.user, group_id, video_id)

        # DRY原則: 共通の検証関数を使用
        error_response = _validate_user_owns_group(request.user, group)
        if error_response:
            return error_response

        error_response = _validate_user_owns_video(request.user, video)
        if error_response:
            return error_response

        # すでに追加されているかチェック（N+1問題対策: 1つのクエリのみ）
        if VideoGroupMember.objects.filter(group=group, video=video).exists():
            return _create_error_response(
                "この動画は既にグループに追加されています", status.HTTP_400_BAD_REQUEST
            )

        # グループに追加
        member = VideoGroupMember.objects.create(group=group, video=video)

        return Response(
            {"message": "動画をグループに追加しました", "id": member.id},
            status=status.HTTP_201_CREATED,
        )

    except Exception as e:
        return _create_error_response(str(e), status.HTTP_500_INTERNAL_SERVER_ERROR)


@authenticated_api_view(["POST"])
def add_videos_to_group(request, group_id):
    """グループに複数の動画を追加（N+1問題対策・DRY原則）"""
    try:
        # DRY原則: 共通の取得関数を使用（ただし、video_idは任意）
        try:
            group = VideoGroup.objects.get(user=request.user, id=group_id)
        except VideoGroup.DoesNotExist:
            group = None

        # DRY原則: 共通の検証関数を使用
        error_response = _validate_user_owns_group(request.user, group)
        if error_response:
            return error_response

        video_ids = request.data.get("video_ids", [])
        if not video_ids:
            return _create_error_response(
                "動画IDが指定されていません", status.HTTP_400_BAD_REQUEST
            )

        # 動画を一括取得（N+1問題対策）
        videos = list(Video.objects.filter(user=request.user, id__in=video_ids))

        if len(videos) != len(video_ids):
            return _create_error_response(
                "一部の動画が見つかりません", status.HTTP_404_NOT_FOUND
            )

        # 既に追加されている動画をチェック（N+1問題対策）
        existing_members = set(
            VideoGroupMember.objects.filter(group=group, video__in=videos).values_list(
                "video_id", flat=True
            )
        )

        # 追加可能な動画のみをフィルタリング（N+1問題対策）
        videos_to_add = [video for video in videos if video.id not in existing_members]

        # バッチで追加
        members_to_create = [
            VideoGroupMember(group=group, video=video) for video in videos_to_add
        ]
        VideoGroupMember.objects.bulk_create(members_to_create)

        added_count = len(members_to_create)
        skipped_count = len(video_ids) - added_count

        return Response(
            {
                "message": f"{added_count}個の動画をグループに追加しました",
                "added_count": added_count,
                "skipped_count": skipped_count,
            },
            status=status.HTTP_201_CREATED,
        )

    except Exception as e:
        return _create_error_response(str(e), status.HTTP_500_INTERNAL_SERVER_ERROR)


@authenticated_api_view(["DELETE"])
def remove_video_from_group(request, group_id, video_id):
    """グループから動画を削除（DRY原則）"""
    try:
        group, video = _get_group_and_video(request.user, group_id, video_id)

        # DRY原則: 共通の検証関数を使用
        error_response = _validate_user_owns_group(request.user, group)
        if error_response:
            return error_response

        error_response = _validate_user_owns_video(request.user, video)
        if error_response:
            return error_response

        # グループメンバーを削除
        member = VideoGroupMember.objects.filter(group=group, video=video).first()
        if not member:
            return _create_error_response("この動画はグループに追加されていません")

        member.delete()

        return Response(
            {"message": "動画をグループから削除しました"}, status=status.HTTP_200_OK
        )

    except Exception as e:
        return _create_error_response(str(e), status.HTTP_500_INTERNAL_SERVER_ERROR)
