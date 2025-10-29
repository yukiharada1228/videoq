from app.models import Video, VideoGroup, VideoGroupMember
from app.utils.decorators import authenticated_view_with_error_handling
from app.utils.mixins import AuthenticatedViewMixin, DynamicSerializerMixin
from app.utils.query_optimizer import BatchProcessor, QueryOptimizer
from app.utils.responses import create_error_response
from rest_framework import generics, status
from rest_framework.response import Response

from .serializers import (VideoCreateSerializer, VideoGroupCreateSerializer,
                          VideoGroupDetailSerializer, VideoGroupListSerializer,
                          VideoGroupUpdateSerializer, VideoListSerializer,
                          VideoSerializer, VideoUpdateSerializer)


class BaseVideoView(AuthenticatedViewMixin):
    """共通のVideoビュー基底クラス（DRY原則・N+1問題対策）"""

    def get_queryset(self):
        """現在のユーザーのVideoのみを返す共通ロジック（N+1問題対策）"""
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

    def should_include_groups(self):
        return True

    def should_include_transcript(self):
        return True

    def destroy(self, request, *args, **kwargs):
        """Video削除時にファイルとベクトルデータも削除（DRY原則・N+1問題対策）"""
        instance = self.get_object()
        video_id = instance.id

        # ファイルが存在する場合は削除
        if instance.file:
            instance.file.delete(save=False)

        # DRY原則: PGVectorManagerを使用してベクトル削除
        from app.utils.vector_manager import PGVectorManager

        try:

            def delete_operation(cursor):
                delete_query = """
                    DELETE FROM langchain_pg_embedding 
                    WHERE cmetadata->>'video_id' = %s
                """
                cursor.execute(delete_query, (str(video_id),))
                return cursor.rowcount

            deleted_count = PGVectorManager.execute_with_connection(delete_operation)

            if deleted_count > 0:
                import logging

                logger = logging.getLogger(__name__)
                logger.info(
                    f"Deleted {deleted_count} vector documents for video {video_id}"
                )

        except Exception as e:
            import logging

            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to delete vectors for video {video_id}: {e}")

        return super().destroy(request, *args, **kwargs)


class BaseVideoGroupView(AuthenticatedViewMixin):
    """共通のVideoGroupビュー基底クラス（DRY原則）"""

    def _get_filtered_queryset(self, annotate_only=False):
        """共通のクエリ取得ロジック（DRY原則・N+1問題対策）"""
        return QueryOptimizer.get_video_groups_with_videos(
            user_id=self.request.user.id,
            include_videos=not annotate_only,
            annotate_video_count=True,
        )


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


def _validate_and_get_resource(
    user, model_class, resource_id, entity_name: str, select_related_fields=None
):
    """共通のリソース取得と検証ロジック（DRY原則・N+1問題対策）"""
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
    """共通のグループとビデオ取得ロジック（DRY原則・N+1問題対策）"""
    # DRY原則: 共通の検証関数を使用
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


def _handle_group_video_operation(
    request,
    group_id,
    video_id,
    operation_func,
    success_message,
    success_status=status.HTTP_200_OK,
):
    """
    グループと動画の操作を共通処理（DRY原則・N+1問題対策）

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

    # DRY原則: 共通の検証結果をチェック
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
    """共通のメンバークエリ（DRY原則・N+1問題対策）"""
    queryset = VideoGroupMember.objects.filter(group=group)
    if video:
        queryset = queryset.filter(video=video)

    # N+1問題対策: videoやgroupのデータが必要な場合のみselect_relatedを適用
    if select_related:
        queryset = queryset.select_related("video", "group")

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


# DRY原則: 共通デコレーターはapp.utils.decoratorsからインポート済み


def _add_video_to_group_operation(group, video):
    """動画をグループに追加する操作（DRY原則）"""
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
def add_video_to_group(request, group_id, video_id):
    """グループに動画を追加（DRY原則・N+1問題対策）"""
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
    # select_relatedはここでは不要（userデータは既に検証済み）
    videos = list(Video.objects.filter(user=request.user, id__in=video_ids))

    # DRY原則: 共通のバリデーション関数を使用
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


@authenticated_view_with_error_handling(["PATCH"])
def reorder_videos_in_group(request, group_id):
    """グループ内の動画の順序を更新"""
    # DRY原則: 共通の検証関数を使用
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
    members = VideoGroupMember.objects.filter(group=group).select_related("video")

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
