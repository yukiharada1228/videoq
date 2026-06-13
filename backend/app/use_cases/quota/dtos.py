from dataclasses import dataclass
from typing import Optional


@dataclass
class SubscriptionDTO:
    used_storage_bytes: int
    used_processing_seconds: int
    used_ai_answers: int
    storage_limit_bytes: Optional[int]
    processing_limit_seconds: Optional[int]
    ai_answers_limit: Optional[int]
    is_over_quota: bool = False
