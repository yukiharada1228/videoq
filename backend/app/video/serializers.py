import logging

from app.models import Video, VideoGroup, VideoGroupMember
from app.tasks import transcribe_video
from rest_framework import serializers

logger = logging.getLogger(__name__)


class UserOwnedSerializerMixin:
    """ユーザー所有リソースの共通シリアライザー基底クラス（DRY原則）"""

    def create(self, validated_data):
        """ユーザーを現在のユーザーに設定（DRY原則）"""
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)


class BaseVideoGroupSerializer(serializers.ModelSerializer):
    """VideoGroupの共通基底シリアライザー（DRY原則）"""

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
        video = super().create(validated_data)

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
        read_only_fields = ["id", "created_at", "updated_at", "video_count", "share_token", "owner_has_api_key"]

    def get_videos(self, obj):
        """ビデオの詳細情報を取得（N+1問題対策・DRY原則）"""
        # N+1問題対策: prefetch_relatedで既に取得されているメンバーを使用（追加クエリなし）
        # list()で評価を確定（遅延評価の回避）
        members = list(obj.members.all())

        if not members:
            return []

        # DRY原則: 共通のシリアライズ処理を使用
        return self._serialize_members_with_order(members)

    def _serialize_members_with_order(self, members):
        """
        メンバーをorder情報付きでシリアライズ（DRY原則・N+1問題対策）
        """
        # VideoListSerializerを使って各videoをシリアライズ（絶対URLを自動生成・DRY原則）
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
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Group ID: {obj.id}, User: {obj.user}, Has user: {obj.user is not None}")
        if obj.user:
            logger.info(f"User ID: {obj.user.id}, Encrypted API key: {obj.user.encrypted_openai_api_key is not None}")
            has_key = bool(obj.user.encrypted_openai_api_key)
            logger.info(f"Has API key: {has_key}")
            return has_key
        return False


class VideoGroupCreateSerializer(UserOwnedSerializerMixin, BaseVideoGroupSerializer):
    """VideoGroup作成用のシリアライザー（DRY原則）"""

    pass


class VideoGroupUpdateSerializer(BaseVideoGroupSerializer):
    """VideoGroup更新用のシリアライザー（DRY原則）"""

    pass
