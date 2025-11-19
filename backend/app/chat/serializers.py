from app.models import ChatLog
from rest_framework import serializers


class MessageSerializer(serializers.Serializer):
    """Message in chat conversation"""

    role = serializers.ChoiceField(choices=["user", "assistant", "system"])
    content = serializers.CharField()


class ChatRequestSerializer(serializers.Serializer):
    """Request serializer for chat endpoint"""

    messages = MessageSerializer(
        many=True, help_text="List of messages in the conversation"
    )
    group_id = serializers.IntegerField(
        required=False, allow_null=True, help_text="Optional group ID for RAG context"
    )


class ChatResponseSerializer(serializers.Serializer):
    """Response serializer for chat endpoint"""

    role = serializers.CharField(help_text="Role of the message sender (assistant)")
    content = serializers.CharField(help_text="Content of the assistant's response")
    related_videos = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        allow_null=True,
        help_text="List of related videos (only when group_id is provided)",
    )
    chat_log_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="ID of the created chat log (only when group_id is provided)",
    )
    feedback = serializers.CharField(
        required=False,
        allow_null=True,
        help_text="Feedback status for the chat log (only when group_id is provided)",
    )


class ChatFeedbackRequestSerializer(serializers.Serializer):
    """Request serializer for chat feedback endpoint"""

    chat_log_id = serializers.IntegerField(
        help_text="ID of the chat log to provide feedback for"
    )
    feedback = serializers.ChoiceField(
        choices=["good", "bad", None],
        required=False,
        allow_null=True,
        help_text="Feedback value: 'good', 'bad', or null (unspecified)",
    )


class ChatFeedbackResponseSerializer(serializers.Serializer):
    """Response serializer for chat feedback endpoint"""

    chat_log_id = serializers.IntegerField(help_text="ID of the chat log")
    feedback = serializers.CharField(
        required=False,
        allow_null=True,
        help_text="Feedback status: 'good', 'bad', or null",
    )


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
