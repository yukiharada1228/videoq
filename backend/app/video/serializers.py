from rest_framework import serializers

from app.models import Video


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
    """Video一覧用のシリアライザー（ファイルパスは含まない）"""

    class Meta:
        model = Video
        fields = ["id", "title", "description", "uploaded_at", "status"]
        read_only_fields = ["id", "uploaded_at"]

