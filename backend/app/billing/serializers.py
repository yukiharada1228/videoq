from rest_framework import serializers

from app.models.subscription import PLAN_LIMITS, PlanType


class PlanSerializer(serializers.Serializer):
    name = serializers.CharField()
    plan_id = serializers.CharField()
    price = serializers.IntegerField()
    currency = serializers.CharField()
    storage_gb = serializers.IntegerField()
    processing_minutes = serializers.IntegerField()
    ai_answers = serializers.IntegerField()


class SubscriptionSerializer(serializers.Serializer):
    plan = serializers.CharField()
    stripe_status = serializers.CharField()
    current_period_end = serializers.DateTimeField()
    cancel_at_period_end = serializers.BooleanField()
    is_active = serializers.BooleanField()
    limits = serializers.DictField()


class CreateCheckoutSessionSerializer(serializers.Serializer):
    plan = serializers.ChoiceField(
        choices=[PlanType.STANDARD, PlanType.BUSINESS]
    )
    success_url = serializers.URLField()
    cancel_url = serializers.URLField()


class CreateBillingPortalSerializer(serializers.Serializer):
    return_url = serializers.URLField()


def get_plans_data():
    """Return plan data for the pricing page."""
    plan_info = {
        PlanType.FREE: {"name": "Free", "price": 0},
        PlanType.STANDARD: {"name": "Standard", "price": 2980},
        PlanType.BUSINESS: {"name": "Business", "price": 9800},
    }

    plans = []
    for plan_type, limits in PLAN_LIMITS.items():
        info = plan_info.get(plan_type, {})
        plans.append(
            {
                "name": info.get("name", plan_type),
                "plan_id": plan_type,
                "price": info.get("price", 0),
                "currency": "jpy",
                **limits,
            }
        )
    return plans
