from abc import ABC, abstractmethod
from typing import Optional

from app.domain.billing.entities import UserLimitsEntity


class UserLimitsRepository(ABC):
    @abstractmethod
    def get_or_create(self, user_id: int) -> UserLimitsEntity: ...

    @abstractmethod
    def get_by_user_id(self, user_id: int) -> Optional[UserLimitsEntity]: ...

    @abstractmethod
    def save(self, entity: UserLimitsEntity) -> UserLimitsEntity: ...

    @abstractmethod
    def reset_monthly_usage(self, user_id: int, period_start) -> None: ...

    @abstractmethod
    def maybe_reset_monthly_usage(self, user_id: int) -> None:
        """Reset monthly usage counters if a new calendar month has started."""
        ...

    @abstractmethod
    def check_and_reserve_storage(self, user_id: int, additional_bytes: int) -> None:
        """Atomically check storage limit and reserve space if within limit.

        Uses a conditional F() UPDATE (WHERE used_storage_bytes <= limit - additional_bytes)
        to prevent race conditions between concurrent upload requests. The WHERE
        clause and UPDATE are evaluated atomically by the DB engine, so no
        row-level locking is required. If adding additional_bytes would exceed
        the configured storage limit, raises StorageLimitExceeded without modifying
        used_storage_bytes. On success, increments used_storage_bytes by additional_bytes.
        """
        ...

    @abstractmethod
    def increment_storage_bytes(self, user_id: int, bytes_delta: int) -> None:
        """Atomically update used_storage_bytes by bytes_delta.

        Result is clamped to >= 0 to prevent negative storage values.
        Must use a database-level atomic operation (e.g. F() expression) to
        avoid lost updates under concurrent requests.
        """
        ...

    @abstractmethod
    def increment_processing_seconds(self, user_id: int, seconds: int) -> None:
        """Atomically increment used_processing_seconds by seconds.

        Must use a database-level atomic operation (e.g. F() expression) to
        avoid lost updates under concurrent requests.
        """
        ...

    @abstractmethod
    def increment_ai_answers(self, user_id: int) -> None:
        """Atomically increment used_ai_answers by 1.

        Must use a database-level atomic operation (e.g. F() expression) to
        avoid lost updates under concurrent requests.
        """
        ...

    @abstractmethod
    def clear_over_quota_if_within_limit(self, user_id: int) -> None:
        """Clear the is_over_quota flag if used_storage_bytes is now within the configured limit.

        Called after a video deletion reduces storage. If the user's storage is now
        within their configured limit, is_over_quota is set to False, re-enabling AI chat
        and new uploads.
        """
        ...
