"""Serializers for evaluation presentation layer."""

from rest_framework import serializers


class EvaluationSummarySerializer(serializers.Serializer):
    group_id = serializers.IntegerField()
    evaluated_count = serializers.IntegerField()
    avg_faithfulness = serializers.FloatField(allow_null=True)
    avg_answer_relevancy = serializers.FloatField(allow_null=True)
    avg_context_precision = serializers.FloatField(allow_null=True)


class ChatLogEvaluationSerializer(serializers.Serializer):
    chat_log_id = serializers.IntegerField()
    status = serializers.CharField()
    faithfulness = serializers.FloatField(allow_null=True)
    answer_relevancy = serializers.FloatField(allow_null=True)
    context_precision = serializers.FloatField(allow_null=True)
    error_message = serializers.CharField()
    evaluated_at = serializers.DateTimeField(allow_null=True)
