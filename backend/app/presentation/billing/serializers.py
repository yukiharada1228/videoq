from rest_framework import serializers


class PlanSerializer(serializers.Serializer):
    name = serializers.CharField()
    plan_id = serializers.CharField()
    prices = serializers.DictField(child=serializers.IntegerField(allow_null=True), allow_null=True)
    storage_gb = serializers.FloatField(allow_null=True)
    processing_minutes = serializers.IntegerField(allow_null=True)
    ai_answers = serializers.IntegerField(allow_null=True)
    is_contact_required = serializers.BooleanField()


class SubscriptionSerializer(serializers.Serializer):
    plan = serializers.CharField()
    stripe_status = serializers.CharField()
    current_period_end = serializers.DateTimeField(allow_null=True)
    cancel_at_period_end = serializers.BooleanField()
    is_active = serializers.BooleanField()
    used_storage_bytes = serializers.IntegerField()
    used_processing_seconds = serializers.IntegerField()
    used_ai_answers = serializers.IntegerField()
    storage_limit_bytes = serializers.IntegerField(allow_null=True)
    processing_limit_seconds = serializers.IntegerField(allow_null=True)
    ai_answers_limit = serializers.IntegerField(allow_null=True)
    is_over_quota = serializers.BooleanField()


class CreateCheckoutSessionSerializer(serializers.Serializer):
    plan = serializers.CharField()
    success_url = serializers.URLField()
    cancel_url = serializers.URLField()
    currency = serializers.ChoiceField(choices=["jpy", "usd"], default="jpy")


class CreateBillingPortalSerializer(serializers.Serializer):
    return_url = serializers.URLField()
