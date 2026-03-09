"""
Presentation layer serializers for the chat domain.
Pure I/O validation, no business logic.
"""

from rest_framework import serializers


class MessageSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["user", "assistant", "system"])
    content = serializers.CharField()


class ChatRequestSerializer(serializers.Serializer):
    messages = MessageSerializer(many=True)
    group_id = serializers.IntegerField(required=False, allow_null=True)


class ChatResponseSerializer(serializers.Serializer):
    role = serializers.CharField()
    content = serializers.CharField()
    related_videos = serializers.ListField(
        child=serializers.DictField(), required=False, allow_null=True
    )
    chat_log_id = serializers.IntegerField(required=False, allow_null=True)
    feedback = serializers.CharField(required=False, allow_null=True)


class ChatSearchRequestSerializer(serializers.Serializer):
    query_text = serializers.CharField()
    group_id = serializers.IntegerField(required=True)


class ChatSearchResponseSerializer(serializers.Serializer):
    query_text = serializers.CharField()
    related_videos = serializers.ListField(
        child=serializers.DictField(), required=False, allow_null=True
    )


class RelatedVideoSerializer(serializers.Serializer):
    video_id = serializers.IntegerField()
    title = serializers.CharField()
    start_time = serializers.CharField(allow_null=True, required=False)
    end_time = serializers.CharField(allow_null=True, required=False)


class ChatFeedbackRequestSerializer(serializers.Serializer):
    chat_log_id = serializers.IntegerField()
    feedback = serializers.ChoiceField(
        choices=["good", "bad", None], required=False, allow_null=True
    )


class ChatFeedbackResponseSerializer(serializers.Serializer):
    chat_log_id = serializers.IntegerField()
    feedback = serializers.CharField(required=False, allow_null=True)


class ChatLogSerializer(serializers.Serializer):
    """Output serializer for ChatLogEntity."""

    id = serializers.IntegerField()
    group = serializers.IntegerField(source="group_id")
    question = serializers.CharField()
    answer = serializers.CharField()
    related_videos = RelatedVideoSerializer(many=True)
    is_shared_origin = serializers.BooleanField()
    feedback = serializers.CharField(allow_null=True)
    created_at = serializers.DateTimeField()


class ChatAnalyticsSummarySerializer(serializers.Serializer):
    total_questions = serializers.IntegerField()
    date_range = serializers.DictField(child=serializers.CharField(allow_null=True))


class ChatAnalyticsSceneSerializer(serializers.Serializer):
    video_id = serializers.IntegerField()
    title = serializers.CharField()
    start_time = serializers.CharField()
    end_time = serializers.CharField()
    question_count = serializers.IntegerField()


class ChatAnalyticsTimeSeriesSerializer(serializers.Serializer):
    date = serializers.CharField()
    count = serializers.IntegerField()


class ChatAnalyticsFeedbackSerializer(serializers.Serializer):
    good = serializers.IntegerField()
    bad = serializers.IntegerField()
    none = serializers.IntegerField()


class ChatAnalyticsKeywordSerializer(serializers.Serializer):
    word = serializers.CharField()
    count = serializers.IntegerField()


class ChatAnalyticsResponseSerializer(serializers.Serializer):
    summary = ChatAnalyticsSummarySerializer()
    scene_distribution = ChatAnalyticsSceneSerializer(many=True)
    time_series = ChatAnalyticsTimeSeriesSerializer(many=True)
    feedback = ChatAnalyticsFeedbackSerializer()
    keywords = ChatAnalyticsKeywordSerializer(many=True)
