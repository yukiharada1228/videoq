from django.conf import settings
from django.db import models


class Subscription(models.Model):
    class PlanType(models.TextChoices):
        FREE = "free", "Free"
        LITE = "lite", "Lite"
        STANDARD = "standard", "Standard"
        ENTERPRISE = "enterprise", "Enterprise"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="subscription",
    )
    plan = models.CharField(max_length=20, choices=PlanType.choices, default=PlanType.FREE)
    stripe_customer_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    stripe_subscription_id = models.CharField(max_length=255, unique=True, null=True, blank=True)
    stripe_status = models.CharField(max_length=50, default="", blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    # Usage tracking
    used_storage_bytes = models.BigIntegerField(default=0)
    used_processing_seconds = models.IntegerField(default=0)
    used_ai_answers = models.IntegerField(default=0)
    usage_period_start = models.DateTimeField(null=True, blank=True)
    # Enterprise custom limits
    custom_storage_gb = models.FloatField(null=True, blank=True)
    custom_processing_minutes = models.IntegerField(null=True, blank=True)
    custom_ai_answers = models.IntegerField(null=True, blank=True)
    unlimited_processing_minutes = models.BooleanField(default=False)
    unlimited_ai_answers = models.BooleanField(default=False)
    is_over_quota = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "app"
        db_table = "app_subscription"
