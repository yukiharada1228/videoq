from app.models import Video, VideoGroup, VideoGroupMember
from rest_framework import serializers


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


class VideoCreateSerializer(serializers.ModelSerializer):
    """Video作成用のシリアライザー"""

    class Meta:
        model = Video
        fields = ["file", "title", "description"]

    def create(self, validated_data):
        """ユーザーを現在のユーザーに設定"""
        validated_data["user"] = self.context["request"].user
        video = super().create(validated_data)
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

    class Meta:
        model = VideoGroup
        fields = ["id", "name", "description", "created_at", "updated_at", "video_count", "videos"]
        read_only_fields = ["id", "created_at", "updated_at", "video_count"]

    def get_videos(self, obj):
        """ビデオの詳細情報を取得（N+1問題対策）"""
        # prefetch_relatedで既に取得されているメンバーを使用（追加クエリなし）
        # list()で評価を確定（遅延評価の回避）
        members = list(obj.members.all())
        return [
            {
                "id": member.video.id,
                "title": member.video.title,
                "description": member.video.description,
                "file": member.video.file.url if member.video.file else None,
                "uploaded_at": member.video.uploaded_at,
                "status": member.video.status,
                "order": member.order,
            }
            for member in members
        ]


class VideoGroupCreateSerializer(serializers.ModelSerializer):
    """VideoGroup作成用のシリアライザー"""

    class Meta:
        model = VideoGroup
        fields = ["name", "description"]

    def create(self, validated_data):
        """ユーザーを現在のユーザーに設定"""
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)


class VideoGroupUpdateSerializer(serializers.ModelSerializer):
    """VideoGroup更新用のシリアライザー"""

    class Meta:
        model = VideoGroup
        fields = ["name", "description"]
