from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class UserLimitsEntity:
    user_id: int
    storage_limit_gb: float
    processing_limit_minutes: int
    ai_answers_limit: int
    # Usage tracking (current period)
    used_storage_bytes: int
    used_processing_seconds: int
    used_ai_answers: int
    usage_period_start: Optional[datetime]
    unlimited_processing_minutes: bool
    unlimited_ai_answers: bool
    is_over_quota: bool = False

    def get_storage_limit_bytes(self) -> Optional[int]:
        """Returns storage limit in bytes. None = unlimited."""
        if self.storage_limit_gb is None:
            return None
        return int(self.storage_limit_gb * 1024 ** 3)

    def get_processing_limit_seconds(self) -> Optional[int]:
        """Returns monthly processing limit in seconds. None = unlimited."""
        if self.unlimited_processing_minutes:
            return None
        return self.processing_limit_minutes * 60

    def get_ai_answers_limit(self) -> Optional[int]:
        """Returns monthly AI answers limit. None = unlimited."""
        if self.unlimited_ai_answers:
            return None
        return self.ai_answers_limit

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
