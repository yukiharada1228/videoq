from app.models import Video, VideoGroup, VideoGroupMember
from app.utils.mixins import AuthenticatedViewMixin, DynamicSerializerMixin
from app.utils.responses import create_error_response
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .serializers import (VideoCreateSerializer, VideoGroupCreateSerializer,
                          VideoGroupDetailSerializer, VideoGroupListSerializer,
                          VideoGroupUpdateSerializer, VideoListSerializer,
                          VideoSerializer, VideoUpdateSerializer)


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


# create_error_responseはapp.utils.responsesからインポート済み（DRY原則）


def _handle_validation_error(value, entity_name: str):
    """共通のバリデーションチェック（DRY原則）"""
    if not value:
        return create_error_response(
            f"{entity_name}が見つかりません", status.HTTP_404_NOT_FOUND
        )
    return None


def _validate_and_get_resource(user, model_class, resource_id, entity_name: str):
    """共通のリソース取得と検証ロジック（DRY原則・N+1問題対策）"""
    # N+1問題対策: filter().first()を使用してNoneを返す（例外を投げない）
    # userでフィルタリングしているので所有権の確認は自動的に行われる
    resource = model_class.objects.filter(user=user, id=resource_id).first()

    # リソースが見つからない場合（存在しない、または所有権がない）
    error = _handle_validation_error(resource, entity_name)
    if error:
        return None, error

    return resource, None


def _get_group_and_video(user, group_id, video_id):
    """共通のグループとビデオ取得ロジック（DRY原則・N+1問題対策）"""
    # DRY原則: 共通の検証関数を使用
    group, error = _validate_and_get_resource(user, VideoGroup, group_id, "グループ")
    if error:
        return None, None, error

    video, error = _validate_and_get_resource(user, Video, video_id, "動画")
    if error:
        return None, None, error

    return group, video, None


def _validate_video_ids(request, entity_name: str):
    """video_idsのバリデーション（DRY原則）"""
    video_ids = request.data.get("video_ids", [])
    if not video_ids:
        return None, create_error_response(
            f"{entity_name}IDが指定されていません", status.HTTP_400_BAD_REQUEST
        )
    return video_ids, None


def _validate_videos_count(videos, video_ids):
    """動画の取得数チェック（DRY原則）"""
    if len(videos) != len(video_ids):
        return create_error_response(
            "一部の動画が見つかりません", status.HTTP_404_NOT_FOUND
        )
    return None


def _get_member_queryset(group, video=None):
    """共通のメンバークエリ（DRY原則・N+1問題対策）"""
    queryset = VideoGroupMember.objects.filter(group=group)
    if video:
        queryset = queryset.filter(video=video)
    return queryset


def _member_exists(group, video):
    """メンバーの存在チェック（DRY原則・N+1問題対策）"""
    return _get_member_queryset(group, video).exists()


def _check_and_get_member(
    group, video, error_message, status_code=status.HTTP_404_NOT_FOUND
):
    """メンバーの存在チェックと取得（DRY原則・N+1問題対策）"""
    member = _get_member_queryset(group, video).first()
    if not member:
        return None, create_error_response(error_message, status_code)
    return member, None


# DRY原則: 認証必須APIビューデコレーター
def authenticated_api_view(methods):
    """認証必須のAPIビューデコレーター（DRY原則）"""

    def decorator(view_func):
        # utils/mixins.pyのAuthenticatedViewMixinと同様の設定を使用
        return permission_classes(AuthenticatedViewMixin.permission_classes)(
            api_view(methods)(view_func)
        )

    return decorator


def with_error_handling(view_func):
    """共通のエラーハンドリングデコレーター（DRY原則）"""

    def wrapper(*args, **kwargs):
        try:
            return view_func(*args, **kwargs)
        except Exception as e:
            return create_error_response(str(e), status.HTTP_500_INTERNAL_SERVER_ERROR)

    return wrapper


def authenticated_view_with_error_handling(methods):
    """認証とエラーハンドリングを組み合わせたデコレーター（DRY原則）"""

    def decorator(view_func):
        # エラーハンドリングを最初に適用し、次に認証を適用
        wrapped = with_error_handling(view_func)
        return authenticated_api_view(methods)(wrapped)

    return decorator


@authenticated_view_with_error_handling(["POST"])
def add_video_to_group(request, group_id, video_id):
    """グループに動画を追加（DRY原則・N+1問題対策）"""
    group, video, error = _get_group_and_video(request.user, group_id, video_id)

    # DRY原則: 共通の検証結果をチェック
    if error:
        return error

    # すでに追加されているかチェック（N+1問題対策・DRY原則: 1つのクエリのみ）
    member = _get_member_queryset(group, video).first()
    if member:
        return create_error_response(
            "この動画は既にグループに追加されています", status.HTTP_400_BAD_REQUEST
        )

    # グループに追加
    member = VideoGroupMember.objects.create(group=group, video=video)

    return Response(
        {"message": "動画をグループに追加しました", "id": member.id},
        status=status.HTTP_201_CREATED,
    )


@authenticated_view_with_error_handling(["POST"])
def add_videos_to_group(request, group_id):
    """グループに複数の動画を追加（N+1問題対策・DRY原則）"""
    # DRY原則: 共通の検証関数を使用
    group, error = _validate_and_get_resource(
        request.user, VideoGroup, group_id, "グループ"
    )
    if error:
        return error

    # DRY原則: 共通のバリデーション関数を使用
    video_ids, error = _validate_video_ids(request, "動画")
    if error:
        return error

    # 動画を一括取得（N+1問題対策）
    videos = list(Video.objects.filter(user=request.user, id__in=video_ids))

    # DRY原則: 共通のバリデーション関数を使用
    error = _validate_videos_count(videos, video_ids)
    if error:
        return error

    # 既に追加されている動画をチェック（N+1問題対策）
    video_ids_list = [v.id for v in videos]
    existing_members = set(
        _get_member_queryset(group)
        .filter(video_id__in=video_ids_list)
        .values_list("video_id", flat=True)
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


@authenticated_view_with_error_handling(["DELETE"])
def remove_video_from_group(request, group_id, video_id):
    """グループから動画を削除（DRY原則）"""
    group, video, error = _get_group_and_video(request.user, group_id, video_id)

    # DRY原則: 共通の検証結果をチェック
    if error:
        return error

    # グループメンバーを削除（DRY原則・N+1問題対策）
    member, error = _check_and_get_member(
        group, video, "この動画はグループに追加されていません"
    )
    if error:
        return error

    member.delete()

    return Response(
        {"message": "動画をグループから削除しました"}, status=status.HTTP_200_OK
    )
