from app.models import ChatLog
from rest_framework import serializers


class ChatLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatLog
        fields = [
            "id",
            "group",
            "question",
            "answer",
            "related_videos",
            "is_shared_origin",
            "feedback",
            "created_at",
        ]
