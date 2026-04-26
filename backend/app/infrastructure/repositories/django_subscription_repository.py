"""Django ORM implementation of UserLimitsRepository."""

from datetime import timezone
from typing import Optional

from django.contrib.auth import get_user_model
from django.db.models import F, Value
from django.db.models.functions import Greatest

from app.domain.billing.entities import UserLimitsEntity
from app.domain.billing.ports import UserLimitsRepository

User = get_user_model()


class DjangoUserLimitsRepository(UserLimitsRepository):
    def _to_entity(self, obj) -> UserLimitsEntity:
        return UserLimitsEntity(
            user_id=obj.pk,
            storage_limit_gb=obj.storage_limit_gb,
            processing_limit_minutes=obj.processing_limit_minutes,
            ai_answers_limit=obj.ai_answers_limit,
            used_storage_bytes=obj.used_storage_bytes,
            used_processing_seconds=obj.used_processing_seconds,
            used_ai_answers=obj.used_ai_answers,
            usage_period_start=obj.usage_period_start,
            is_over_quota=obj.is_over_quota,
        )

    def get_or_create(self, user_id: int) -> UserLimitsEntity:
        obj = User.objects.get(pk=user_id)
        return self._to_entity(obj)

    def get_by_user_id(self, user_id: int) -> Optional[UserLimitsEntity]:
        obj = User.objects.filter(pk=user_id).first()
        return self._to_entity(obj) if obj is not None else None

    def save(self, entity: UserLimitsEntity) -> UserLimitsEntity:
        User.objects.filter(pk=entity.user_id).update(
            storage_limit_gb=entity.storage_limit_gb,
            processing_limit_minutes=entity.processing_limit_minutes,
            ai_answers_limit=entity.ai_answers_limit,
            used_storage_bytes=entity.used_storage_bytes,
            used_processing_seconds=entity.used_processing_seconds,
            used_ai_answers=entity.used_ai_answers,
            usage_period_start=entity.usage_period_start,
            is_over_quota=entity.is_over_quota,
        )
        return entity

    def reset_monthly_usage(self, user_id: int, period_start) -> None:
        User.objects.filter(pk=user_id).update(
            used_processing_seconds=0,
            used_ai_answers=0,
            usage_period_start=period_start,
        )

    def check_and_reserve_storage(self, user_id: int, additional_bytes: int) -> None:
        from app.domain.billing.exceptions import StorageLimitExceeded

        obj = User.objects.get(pk=user_id)
        entity = self._to_entity(obj)

        if entity.is_over_quota:
            raise StorageLimitExceeded(
                "Storage limit exceeded: account is over quota."
            )

        limit = entity.get_storage_limit_bytes()

        if limit is None:
            User.objects.filter(pk=user_id).update(
                used_storage_bytes=F("used_storage_bytes") + additional_bytes
            )
            return

        updated = User.objects.filter(
            pk=user_id,
            used_storage_bytes__lte=limit - additional_bytes,
        ).update(
            used_storage_bytes=F("used_storage_bytes") + additional_bytes
        )
        if updated == 0:
            raise StorageLimitExceeded(
                f"Storage limit exceeded. Limit: {limit} bytes."
            )

    def increment_storage_bytes(self, user_id: int, bytes_delta: int) -> None:
        User.objects.filter(pk=user_id).update(
            used_storage_bytes=Greatest(Value(0), F("used_storage_bytes") + bytes_delta)
        )

    def increment_processing_seconds(self, user_id: int, seconds: int) -> None:
        User.objects.filter(pk=user_id).update(
            used_processing_seconds=F("used_processing_seconds") + seconds
        )

    def increment_ai_answers(self, user_id: int) -> None:
        User.objects.filter(pk=user_id).update(
            used_ai_answers=F("used_ai_answers") + 1
        )

    def clear_over_quota_if_within_limit(self, user_id: int) -> None:
        entity = self.get_or_create(user_id)
        if not entity.is_over_quota:
            return
        limit = entity.get_storage_limit_bytes()
        if limit is None or entity.used_storage_bytes <= limit:
            User.objects.filter(pk=user_id).update(is_over_quota=False)

    def maybe_reset_monthly_usage(self, user_id: int) -> None:
        """Reset usage counters if a new billing period has started."""
        from datetime import datetime

        entity = self.get_or_create(user_id)
        now = datetime.now(tz=timezone.utc)

        if entity.usage_period_start is None:
            # First usage — just set the start, don't reset anything
            self.reset_monthly_usage(user_id, now)
            return

        # Make period_start timezone-aware for comparison
        period_start: datetime = entity.usage_period_start
        if period_start.tzinfo is None:
            period_start = period_start.replace(tzinfo=timezone.utc)

        if now.year != period_start.year or now.month != period_start.month:
            self.reset_monthly_usage(user_id, now)
