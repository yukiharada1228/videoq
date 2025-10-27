from app.models import Video, VideoGroup, VideoGroupMember
from rest_framework import serializers


class UserOwnedSerializerMixin:
    """ユーザー所有リソースの共通シリアライザー基底クラス（DRY原則）"""

    def create(self, validated_data):
        """ユーザーを現在のユーザーに設定（DRY原則）"""
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)


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
        ]
        read_only_fields = ["id", "created_at", "updated_at", "video_count"]

    def get_videos(self, obj):
        """ビデオの詳細情報を取得（N+1問題対策・DRY原則）"""
        # prefetch_relatedで既に取得されているメンバーを使用（追加クエリなし）
        # list()で評価を確定（遅延評価の回避）
        members = list(obj.members.all())

        if not members:
            return []

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


class VideoGroupCreateSerializer(UserOwnedSerializerMixin, serializers.ModelSerializer):
    """VideoGroup作成用のシリアライザー"""

    class Meta:
        model = VideoGroup
        fields = ["name", "description"]


class VideoGroupUpdateSerializer(serializers.ModelSerializer):
    """VideoGroup更新用のシリアライザー"""

    class Meta:
        model = VideoGroup
        fields = ["name", "description"]
