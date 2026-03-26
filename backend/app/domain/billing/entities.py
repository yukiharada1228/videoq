from dataclasses import dataclass
from enum import Enum
from typing import Optional


class PlanType(str, Enum):
    FREE = "free"
    LITE = "lite"
    STANDARD = "standard"
    ENTERPRISE = "enterprise"


PLAN_LIMITS = {
    PlanType.FREE: {"storage_gb": 1, "processing_minutes": 10, "ai_answers": 500},
    PlanType.LITE: {"storage_gb": 10, "processing_minutes": 120, "ai_answers": 3000},
    PlanType.STANDARD: {"storage_gb": 50, "processing_minutes": 600, "ai_answers": 10000},
    PlanType.ENTERPRISE: {"storage_gb": None, "processing_minutes": None, "ai_answers": None},  # set by admin
}

PLAN_PRICES = {
    PlanType.FREE: {"jpy": 0, "usd": 0},
    PlanType.LITE: {"jpy": 980, "usd": 699},
    PlanType.STANDARD: {"jpy": 2980, "usd": 1999},
    PlanType.ENTERPRISE: {"jpy": None, "usd": None},
}


@dataclass
class SubscriptionEntity:
    user_id: int
    plan: PlanType
    stripe_customer_id: Optional[str]
    stripe_subscription_id: Optional[str]
    stripe_status: str
    current_period_end: Optional[object]  # datetime
    cancel_at_period_end: bool
    # Usage tracking (current period)
    used_storage_bytes: int
    used_processing_seconds: int
    used_ai_answers: int
    usage_period_start: Optional[object]  # datetime
    # Enterprise custom limits (None = use plan default)
    custom_storage_gb: Optional[float]
    custom_processing_minutes: Optional[int]
    custom_ai_answers: Optional[int]
    unlimited_processing_minutes: bool  # enterprise override
    unlimited_ai_answers: bool  # enterprise override

    @property
    def is_stripe_active(self) -> bool:
        if self.plan == PlanType.FREE:
            return True
        if self.plan == PlanType.ENTERPRISE:
            return True
        return self.stripe_status in ("active", "trialing")

    def get_storage_limit_bytes(self) -> Optional[int]:
        """Returns storage limit in bytes. None = unlimited."""
        if self.custom_storage_gb is not None:
            return int(self.custom_storage_gb * 1024 ** 3)
        limits = PLAN_LIMITS.get(self.plan, PLAN_LIMITS[PlanType.FREE])
        gb = limits["storage_gb"]
        if gb is None:
            return None
        return int(gb * 1024 ** 3)

    def get_processing_limit_seconds(self) -> Optional[int]:
        """Returns monthly processing limit in seconds. None = unlimited."""
        if self.unlimited_processing_minutes:
            return None
        if self.custom_processing_minutes is not None:
            return self.custom_processing_minutes * 60
        limits = PLAN_LIMITS.get(self.plan, PLAN_LIMITS[PlanType.FREE])
        minutes = limits["processing_minutes"]
        if minutes is None:
            return None
        return minutes * 60

    def get_ai_answers_limit(self) -> Optional[int]:
        """Returns monthly AI answers limit. None = unlimited."""
        if self.unlimited_ai_answers:
            return None
        if self.custom_ai_answers is not None:
            return self.custom_ai_answers
        limits = PLAN_LIMITS.get(self.plan, PLAN_LIMITS[PlanType.FREE])
        answers = limits["ai_answers"]
        return answers

    def can_use_storage(self, additional_bytes: int) -> bool:
        limit = self.get_storage_limit_bytes()
        if limit is None:
            return True
        return (self.used_storage_bytes + additional_bytes) <= limit

    def can_process(self, additional_seconds: int) -> bool:
        limit = self.get_processing_limit_seconds()
        if limit is None:
            return True
        return (self.used_processing_seconds + additional_seconds) <= limit

    def can_answer(self) -> bool:
        limit = self.get_ai_answers_limit()
        if limit is None:
            return True
        return self.used_ai_answers < limit
