import logging
import secrets

from app.common.responses import create_error_response
from app.models import Video, VideoGroup, VideoGroupMember

logger = logging.getLogger(__name__)
from app.utils.decorators import authenticated_view_with_error_handling
from app.utils.mixins import AuthenticatedViewMixin, DynamicSerializerMixin
from app.utils.query_optimizer import BatchProcessor, QueryOptimizer
from django.db.models import Max, Q
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .serializers import (VideoCreateSerializer, VideoGroupCreateSerializer,
                          VideoGroupDetailSerializer, VideoGroupListSerializer,
                          VideoGroupUpdateSerializer, VideoListSerializer,
                          VideoSerializer, VideoUpdateSerializer)


class BaseVideoView(AuthenticatedViewMixin):
    """共通のVideoビュー基底クラス"""

    def get_queryset(self):
        """現在のユーザーのVideoのみを返す共通ロジック"""
        return QueryOptimizer.get_videos_with_metadata(
            user_id=self.request.user.id,
            include_transcript=self.should_include_transcript(),
            include_groups=self.should_include_groups(),
        )

    def should_include_groups(self):
        return False

    def should_include_transcript(self):
        return False


class VideoListView(DynamicSerializerMixin, BaseVideoView, generics.ListCreateAPIView):
    """Video一覧取得・作成ビュー

    N+1問題対策:
    - VideoListSerializerにuserを含めていないため、select_relatedは不要
    - 将来的に追加の関連データが必要な場合はget_queryset()をオーバーライド可能
    """

    serializer_map = {
        "GET": VideoListSerializer,
        "POST": VideoCreateSerializer,
    }

    def get_queryset(self):
        queryset = super().get_queryset()
        q = self.request.query_params.get("q", "").strip()
        status_value = self.request.query_params.get("status", "").strip()
        ordering = self.request.query_params.get("ordering", "").strip()

        if q:
            queryset = queryset.filter(
                Q(title__icontains=q) | Q(description__icontains=q)
            )

        if status_value:
            queryset = queryset.filter(status=status_value)

        ordering_map = {
            "uploaded_at_desc": "-uploaded_at",
            "uploaded_at_asc": "uploaded_at",
            "title_asc": "title",
            "title_desc": "-title",
        }
        if ordering in ordering_map:
            queryset = queryset.order_by(ordering_map[ordering])

        return queryset


class VideoDetailView(
    DynamicSerializerMixin, BaseVideoView, generics.RetrieveUpdateDestroyAPIView
):
    """Video詳細・更新・削除ビュー"""

    serializer_map = {
        "GET": VideoSerializer,
        "PUT": VideoUpdateSerializer,
        "PATCH": VideoUpdateSerializer,
    }

    def should_include_groups(self):
        return True

    def should_include_transcript(self):
        return True

    def update(self, request, *args, **kwargs):
        """Video更新時にPGVectorのmetadataも更新"""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()

        # 更新前のタイトルを保存
        old_title = instance.title

        # 通常の更新処理を実行
        response = super().update(request, *args, partial=partial, **kwargs)

        # インスタンスを再取得して最新のデータを取得
        instance.refresh_from_db()

        # タイトルが変更された場合、PGVectorのmetadataを更新
        if old_title != instance.title:
            self._update_video_title_in_pgvector(instance.id, instance.title)

        return response

    def _update_video_title_in_pgvector(self, video_id, new_title):
        """PGVectorのmetadata内のvideo_titleを更新"""
        from app.utils.vector_manager import update_video_title_in_vectors

        update_video_title_in_vectors(video_id, new_title)

    def destroy(self, request, *args, **kwargs):
        """Video削除時にファイルとベクトルデータも削除"""
        instance = self.get_object()
        video_id = instance.id

        # ファイルが存在する場合は削除
        if instance.file:
            instance.file.delete(save=False)

        from app.utils.vector_manager import delete_video_vectors

        try:
            delete_video_vectors(video_id)
        except Exception as e:
            logger.warning(f"Failed to delete vectors for video {video_id}: {e}")

        return super().destroy(request, *args, **kwargs)


class BaseVideoGroupView(AuthenticatedViewMixin):
    """共通のVideoGroupビュー基底クラス"""

    def _get_filtered_queryset(self, annotate_only=False):
        """共通のクエリ取得ロジック"""
        return QueryOptimizer.get_video_groups_with_videos(
            user_id=self.request.user.id,
            include_videos=not annotate_only,
            annotate_video_count=True,
        )


class VideoGroupListView(
    DynamicSerializerMixin, BaseVideoGroupView, generics.ListCreateAPIView
):
    """VideoGroup一覧取得・作成ビュー（N+1問題対策）"""

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

    serializer_map = {
        "GET": VideoGroupDetailSerializer,
        "PUT": VideoGroupUpdateSerializer,
        "PATCH": VideoGroupUpdateSerializer,
    }

    def get_queryset(self):
        """現在のユーザーのVideoGroupのみを返す（N+1問題対策）"""
        return self._get_filtered_queryset(annotate_only=False)


def _handle_validation_error(value, entity_name: str):
    """共通のバリデーションチェック"""
    if not value:
        return create_error_response(
            f"{entity_name}が見つかりません", status.HTTP_404_NOT_FOUND
        )
    return None


def _validate_and_get_resource(
    user, model_class, resource_id, entity_name: str, select_related_fields=None
):
    """共通のリソース取得と検証ロジック"""
    # N+1問題対策: filter().first()を使用してNoneを返す（例外を投げない）
    # userでフィルタリングしているので所有権の確認は自動的に行われる
    queryset = model_class.objects.filter(user=user, id=resource_id)

    # N+1問題対策: 必要に応じてselect_relatedを追加
    if select_related_fields:
        queryset = queryset.select_related(*select_related_fields)

    resource = queryset.first()

    # リソースが見つからない場合（存在しない、または所有権がない）
    error = _handle_validation_error(resource, entity_name)
    if error:
        return None, error

    return resource, None


def _get_group_and_video(user, group_id, video_id, select_related_fields=None):
    """共通のグループとビデオ取得ロジック"""
    # N+1問題対策: 必要に応じてselect_relatedを適用
    group, error = _validate_and_get_resource(
        user, VideoGroup, group_id, "グループ", select_related_fields
    )
    if error:
        return None, None, error

    video, error = _validate_and_get_resource(
        user, Video, video_id, "動画", select_related_fields
    )
    if error:
        return None, None, error

    return group, video, None


def _validate_video_ids(request, entity_name: str):
    """video_idsのバリデーション"""
    video_ids = request.data.get("video_ids", [])
    if not video_ids:
        return None, create_error_response(
            f"{entity_name}IDが指定されていません", status.HTTP_400_BAD_REQUEST
        )
    return video_ids, None


def _validate_videos_count(videos, video_ids):
    """動画の取得数チェック"""
    if len(videos) != len(video_ids):
        return create_error_response(
            "一部の動画が見つかりません", status.HTTP_404_NOT_FOUND
        )
    return None


def _handle_group_video_operation(
    request,
    group_id,
    video_id,
    operation_func,
    success_message,
    success_status=status.HTTP_200_OK,
):
    """
    グループと動画の操作を共通処理

    Args:
        request: HTTPリクエスト
        group_id: グループID
        video_id: 動画ID
        operation_func: 実行する操作の関数
        success_message: 成功時のメッセージ
        success_status: 成功時のステータスコード

    Returns:
        Response: 操作結果
    """
    group, video, error = _get_group_and_video(request.user, group_id, video_id)

    if error:
        return error

    # 操作を実行
    result = operation_func(group, video)
    if isinstance(result, Response):
        return result

    return Response(
        {"message": success_message},
        status=success_status,
    )


def _get_member_queryset(group, video=None, select_related=False):
    """共通のメンバークエリ"""
    queryset = VideoGroupMember.objects.filter(group=group)
    if video:
        queryset = queryset.filter(video=video)

    # N+1問題対策: videoやgroupのデータが必要な場合のみselect_relatedを適用
    if select_related:
        queryset = queryset.select_related("video", "group")

    return queryset


def _member_exists(group, video):
    """メンバーの存在チェック"""
    return _get_member_queryset(group, video).exists()


def _check_and_get_member(
    group, video, error_message, status_code=status.HTTP_404_NOT_FOUND
):
    """メンバーの存在チェックと取得"""
    member = _get_member_queryset(group, video).first()
    if not member:
        return None, create_error_response(error_message, status_code)
    return member, None


# 共通デコレーターはapp.utils.decoratorsからインポート済み


def _add_video_to_group_operation(group, video):
    """動画をグループに追加する操作"""
    # すでに追加されているかチェック
    member = _get_member_queryset(group, video).first()
    if member:
        return create_error_response(
            "この動画は既にグループに追加されています", status.HTTP_400_BAD_REQUEST
        )

    # グループ内の末尾に配置されるよう order を採番
    max_order = (
        _get_member_queryset(group).aggregate(max_order=Max("order")).get("max_order")
    )
    next_order = (max_order if max_order is not None else -1) + 1

    member = VideoGroupMember.objects.create(
        group=group,
        video=video,
        order=next_order,
    )
    return Response(
        {"message": "動画をグループに追加しました", "id": member.id},
        status=status.HTTP_201_CREATED,
    )


@authenticated_view_with_error_handling(["POST"])
def add_video_to_group(request, group_id, video_id):
    """グループに動画を追加"""
    return _handle_group_video_operation(
        request,
        group_id,
        video_id,
        _add_video_to_group_operation,
        "動画をグループに追加しました",
        status.HTTP_201_CREATED,
    )


@authenticated_view_with_error_handling(["POST"])
def add_videos_to_group(request, group_id):
    """グループに複数の動画を追加"""
    group, error = _validate_and_get_resource(
        request.user, VideoGroup, group_id, "グループ"
    )
    if error:
        return error

    video_ids, error = _validate_video_ids(request, "動画")
    if error:
        return error

    # 動画を一括取得（N+1問題対策）
    # select_relatedはここでは不要（userデータは既に検証済み）
    videos = list(Video.objects.filter(user=request.user, id__in=video_ids))

    error = _validate_videos_count(videos, video_ids)
    if error:
        return error

    # 既に追加されている動画をチェック（N+1問題対策）
    # 一括でvideo_idを取得してSetでO(1)ルックアップを実現
    video_ids_list = [v.id for v in videos]
    existing_members = set(
        _get_member_queryset(group)
        .filter(video_id__in=video_ids_list)
        .values_list("video_id", flat=True)
    )

    # 追加可能な動画のみを、選択順にフィルタリング（N+1問題対策）
    video_map = {video.id: video for video in videos}
    videos_to_add = [
        video_map[video_id]
        for video_id in video_ids
        if video_id in video_map and video_id not in existing_members
    ]

    # バッチで追加
    current_max_order = (
        _get_member_queryset(group).aggregate(max_order=Max("order")).get("max_order")
    )
    base_order = current_max_order if current_max_order is not None else -1
    members_to_create = [
        VideoGroupMember(
            group=group,
            video=video,
            order=base_order + index,
        )
        for index, video in enumerate(videos_to_add, start=1)
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
    """グループから動画を削除"""
    group, video, error = _get_group_and_video(request.user, group_id, video_id)

    if error:
        return error

    # グループメンバーを削除
    member, error = _check_and_get_member(
        group, video, "この動画はグループに追加されていません"
    )
    if error:
        return error

    member.delete()

    return Response(
        {"message": "動画をグループから削除しました"}, status=status.HTTP_200_OK
    )


@authenticated_view_with_error_handling(["PATCH"])
def reorder_videos_in_group(request, group_id):
    """グループ内の動画の順序を更新"""
    group, error = _validate_and_get_resource(
        request.user, VideoGroup, group_id, "グループ"
    )
    if error:
        return error

    # リクエストボディからvideo_idsの配列を取得
    try:
        video_ids = request.data.get("video_ids", [])
        if not isinstance(video_ids, list):
            return create_error_response(
                "video_idsは配列である必要があります", status.HTTP_400_BAD_REQUEST
            )
    except Exception:
        return create_error_response(
            "リクエストボディの解析に失敗しました", status.HTTP_400_BAD_REQUEST
        )

    # グループ内の動画メンバーを取得（N+1問題対策）
    # select_relatedでvideoデータも事前取得
    # list()で評価を確定してN+1問題を完全に回避
    members = list(VideoGroupMember.objects.filter(group=group).select_related("video"))

    # 指定されたvideo_idsがグループ内の動画と一致するかチェック
    # O(1)ルックアップのためにSetを使用
    group_video_ids = set(member.video_id for member in members)
    if set(video_ids) != group_video_ids:
        return create_error_response(
            "指定された動画IDがグループ内の動画と一致しません",
            status.HTTP_400_BAD_REQUEST,
        )

    # 順序を更新（N+1問題対策）
    # bulk_updateを使用して一括更新
    member_dict = {member.video_id: member for member in members}
    members_to_update = []

    for index, video_id in enumerate(video_ids):
        member = member_dict[video_id]
        member.order = index
        members_to_update.append(member)

    # 一括更新でN+1問題を解決
    VideoGroupMember.objects.bulk_update(members_to_update, ["order"])

    return Response({"message": "動画の順序を更新しました"}, status=status.HTTP_200_OK)


def _update_share_token(group, token_value):
    """
    共有トークンを更新する共通処理

    Args:
        group: VideoGroupインスタンス
        token_value: 設定するトークン値（Noneの場合は削除）

    Returns:
        None
    """
    group.share_token = token_value
    group.save(update_fields=["share_token"])


@authenticated_view_with_error_handling(["POST"])
def create_share_link(request, group_id):
    """グループの共有リンクを生成"""
    # グループの取得と検証
    group, error = _validate_and_get_resource(
        request.user, VideoGroup, group_id, "グループ"
    )
    if error:
        return error

    share_token = secrets.token_urlsafe(32)
    _update_share_token(group, share_token)

    return Response(
        {
            "message": "共有リンクを生成しました",
            "share_token": share_token,
        },
        status=status.HTTP_201_CREATED,
    )


@authenticated_view_with_error_handling(["DELETE"])
def delete_share_link(request, group_id):
    """グループの共有リンクを無効化"""
    # グループの取得と検証
    group, error = _validate_and_get_resource(
        request.user, VideoGroup, group_id, "グループ"
    )
    if error:
        return error

    if not group.share_token:
        return create_error_response(
            "共有リンクは設定されていません", status.HTTP_404_NOT_FOUND
        )

    _update_share_token(group, None)

    return Response(
        {"message": "共有リンクを無効化しました"},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def get_shared_group(request, share_token):
    """
    共有トークンでグループを取得（認証不要）

    公開グループとして誰でもアクセス可能
    """
    # share_tokenでグループを取得（N+1問題対策）
    # user_idでフィルタせず、share_tokenのみでフィルタ
    queryset = VideoGroup.objects.filter(share_token=share_token)

    # QueryOptimizerを使用してN+1問題を解決
    group = QueryOptimizer.optimize_video_group_queryset(
        queryset,
        include_videos=True,
        include_user=True,  # オーナーのAPIキー情報を取得するため必要
        annotate_video_count=True,
    ).first()

    if not group:
        return create_error_response(
            "共有リンクが見つかりません", status.HTTP_404_NOT_FOUND
        )

    # シリアライザーを使用してレスポンスを生成
    serializer = VideoGroupDetailSerializer(group)
    return Response(serializer.data, status=status.HTTP_200_OK)
