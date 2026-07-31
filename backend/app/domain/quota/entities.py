from dataclasses import dataclass
from datetime import datetime


@dataclass
class UserLimitsEntity:
    user_id: int
    storage_limit_gb: float | None
    processing_limit_minutes: int | None
    ai_answers_limit: int | None
    # Usage tracking (current period)
    used_storage_bytes: int
    used_processing_seconds: int
    used_ai_answers: int
    usage_period_start: datetime | None
    is_over_quota: bool = False

    def get_storage_limit_bytes(self) -> int | None:
        """Returns storage limit in bytes. None = unlimited."""
        if self.storage_limit_gb is None:
            return None
        return int(self.storage_limit_gb * 1024 ** 3)

    def get_processing_limit_seconds(self) -> int | None:
        """Returns monthly processing limit in seconds. None = unlimited."""
        if self.processing_limit_minutes is None:
            return None
        return self.processing_limit_minutes * 60

    def get_ai_answers_limit(self) -> int | None:
        """Returns monthly AI answers limit. None = unlimited."""
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
