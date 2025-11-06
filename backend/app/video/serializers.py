import logging

from app.models import Video, VideoGroup, VideoGroupMember
from app.tasks import transcribe_video
from rest_framework import serializers

logger = logging.getLogger(__name__)


class UserOwnedSerializerMixin:
    """ユーザー所有リソースの共通シリアライザー基底クラス"""

    def create(self, validated_data):
        """ユーザーを現在のユーザーに設定"""
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)


class BaseVideoGroupSerializer(serializers.ModelSerializer):
    """VideoGroupの共通基底シリアライザー"""

    class Meta:
        model = VideoGroup
        fields = ["name", "description"]


class VideoSerializer(serializers.ModelSerializer):
    """Videoモデルのシリアライザー"""

    class Meta:
        model = Video
        fields = [
            "id",
            "user",
            "file",
            "title",
            "description",
            "uploaded_at",
            "transcript",
            "status",
            "error_message",
        ]
        read_only_fields = ["id", "user", "uploaded_at"]


class VideoCreateSerializer(UserOwnedSerializerMixin, serializers.ModelSerializer):
    """Video作成用のシリアライザー"""

    class Meta:
        model = Video
        fields = ["file", "title", "description"]

    def create(self, validated_data):
        """Video作成時に文字起こしタスクを開始"""
        request = self.context.get("request")
        user = getattr(request, "user", None)

        if user and getattr(user, "video_limit", None) is not None:
            current_count = Video.objects.filter(user=user).count()
            if current_count >= user.video_limit:
                raise serializers.ValidationError(
                    {
                        "detail": "動画の上限に達しています。不要な動画を削除するか、管理者に上限の変更を依頼してください。"
                    }
                )

        # Authorizationヘッダーが存在するかチェック（外部APIクライアントの判定）
        is_external_client = request and request.META.get("HTTP_AUTHORIZATION")

        # Videoインスタンスを作成
        video = super().create(validated_data)

        # 外部APIクライアントからの場合はフラグを設定
        if is_external_client:
            video.is_external_upload = True
            video.save(update_fields=["is_external_upload"])
            logger.info(
                f"External API client upload detected for video ID: {video.id}. File will be deleted after processing."
            )

        # Celeryタスクを非同期で実行
        logger.info(f"Starting transcription task for video ID: {video.id}")
        try:
            task = transcribe_video.delay(video.id)
            logger.info(f"Transcription task created with ID: {task.id}")
        except Exception as e:
            logger.error(f"Failed to start transcription task: {e}")

        return video


class VideoUpdateSerializer(serializers.ModelSerializer):
    """Video更新用のシリアライザー"""

    class Meta:
        model = Video
        fields = ["title", "description"]


class VideoListSerializer(serializers.ModelSerializer):
    """Video一覧用のシリアライザー
    Note: userフィールドを含めていないため、N+1問題対策のため
    VideoListViewではselect_related('user')は不要
    """

    class Meta:
        model = Video
        fields = ["id", "file", "title", "description", "uploaded_at", "status"]
        read_only_fields = ["id", "uploaded_at"]


class VideoGroupListSerializer(serializers.ModelSerializer):
    """VideoGroup一覧用のシリアライザー"""

    video_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = VideoGroup
        fields = ["id", "name", "description", "created_at", "video_count"]
        read_only_fields = ["id", "created_at", "video_count"]


class VideoGroupDetailSerializer(serializers.ModelSerializer):
    """VideoGroup詳細用のシリアライザー"""

    video_count = serializers.IntegerField(read_only=True)
    videos = serializers.SerializerMethodField()
    owner_has_api_key = serializers.SerializerMethodField()

    class Meta:
        model = VideoGroup
        fields = [
            "id",
            "name",
            "description",
            "created_at",
            "updated_at",
            "video_count",
            "videos",
            "share_token",
            "owner_has_api_key",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "video_count",
            "share_token",
            "owner_has_api_key",
        ]

    def get_videos(self, obj):
        """ビデオの詳細情報を取得"""
        # N+1問題対策: prefetch_relatedで既に取得されているメンバーを使用（追加クエリなし）
        # list()で評価を確定（遅延評価の回避）
        members = list(obj.members.all())

        if not members:
            return []

        return self._serialize_members_with_order(members)

    def _serialize_members_with_order(self, members):
        """メンバーをorder情報付きでシリアライズ"""
        # VideoListSerializerを使って各videoをシリアライズ（絶対URLを自動生成）
        videos = [member.video for member in members]
        video_data_list = VideoListSerializer(
            videos, many=True, context=self.context
        ).data

        # order情報を追加して返す（N+1問題対策: O(n)のルックアップ）
        return [
            {**video_data, "order": member.order}
            for member, video_data in zip(members, video_data_list)
        ]

    def get_owner_has_api_key(self, obj):
        """グループオーナーがAPIキーを持っているかを返す"""
        user = obj.user
        if not user:
            return False

        return bool(user.encrypted_openai_api_key)


class VideoGroupCreateSerializer(UserOwnedSerializerMixin, BaseVideoGroupSerializer):
    """VideoGroup作成用のシリアライザー"""

    pass


class VideoGroupUpdateSerializer(BaseVideoGroupSerializer):
    """VideoGroup更新用のシリアライザー"""

    pass
