from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Optional


@dataclass
class PlanDTO:
    name: str
    plan_id: str
    prices: Dict[str, Optional[int]]  # {"jpy": 980, "usd": 699}
    storage_gb: Optional[float]
    processing_minutes: Optional[int]
    ai_answers: Optional[int]
    is_contact_required: bool


@dataclass
class SubscriptionDTO:
    plan: str
    stripe_status: str
    current_period_end: Optional[datetime]
    cancel_at_period_end: bool
    is_active: bool
    used_storage_bytes: int
    used_processing_seconds: int
    used_ai_answers: int
    storage_limit_bytes: Optional[int]
    processing_limit_seconds: Optional[int]
    ai_answers_limit: Optional[int]
    is_over_quota: bool = False


@dataclass
class CheckoutSessionDTO:
    checkout_url: str
    upgraded: bool = False


@dataclass
class BillingPortalDTO:
    portal_url: str
