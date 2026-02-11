from django.conf import settings
from django.db import models


class PlanType(models.TextChoices):
    FREE = "free", "Free"
    STANDARD = "standard", "Standard"
    BUSINESS = "business", "Business"


PLAN_LIMITS = {
    PlanType.FREE: {
        "storage_gb": 0.5,
        "processing_minutes": 5,
        "ai_answers": 100,
    },
    PlanType.STANDARD: {
        "storage_gb": 25,
        "processing_minutes": 300,
        "ai_answers": 1000,
    },
    PlanType.BUSINESS: {
        "storage_gb": 100,
        "processing_minutes": 1000,
        "ai_answers": 10000,
    },
}


class Subscription(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="subscription",
    )
    plan = models.CharField(
        max_length=20,
        choices=PlanType.choices,
        default=PlanType.FREE,
    )
    stripe_customer_id = models.CharField(
        max_length=255, unique=True, null=True, blank=True
    )
    stripe_subscription_id = models.CharField(
        max_length=255, unique=True, null=True, blank=True
    )
    stripe_status = models.CharField(
        max_length=50, default="", blank=True
    )
    current_period_end = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "app_subscription"

    def __str__(self):
        return f"{self.user.username} - {self.plan}"

    @property
    def is_active(self):
        if self.plan == PlanType.FREE:
            return True
        return self.stripe_status in ("active", "trialing")

    @property
    def limits(self):
        return PLAN_LIMITS.get(self.plan, PLAN_LIMITS[PlanType.FREE])
