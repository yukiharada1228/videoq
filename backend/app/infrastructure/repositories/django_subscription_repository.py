"""Django ORM implementation of SubscriptionRepository."""

from datetime import timedelta, timezone
from typing import Optional

from django.db.models import F, Value
from django.db.models.functions import Greatest

from app.domain.billing.entities import PlanType, SubscriptionEntity
from app.domain.billing.ports import SubscriptionRepository


class DjangoSubscriptionRepository(SubscriptionRepository):
    def _get_model(self):
        from app.infrastructure.models.subscription import Subscription
        return Subscription

    def _to_entity(self, obj) -> SubscriptionEntity:
        return SubscriptionEntity(
            user_id=obj.user_id,
            plan=PlanType(obj.plan),
            stripe_customer_id=obj.stripe_customer_id,
            stripe_subscription_id=obj.stripe_subscription_id,
            stripe_status=obj.stripe_status,
            current_period_end=obj.current_period_end,
            cancel_at_period_end=obj.cancel_at_period_end,
            used_storage_bytes=obj.used_storage_bytes,
            used_processing_seconds=obj.used_processing_seconds,
            used_ai_answers=obj.used_ai_answers,
            usage_period_start=obj.usage_period_start,
            custom_storage_gb=obj.custom_storage_gb,
            custom_processing_minutes=obj.custom_processing_minutes,
            custom_ai_answers=obj.custom_ai_answers,
            unlimited_processing_minutes=obj.unlimited_processing_minutes,
            unlimited_ai_answers=obj.unlimited_ai_answers,
        )

    def get_or_create(self, user_id: int) -> SubscriptionEntity:
        Subscription = self._get_model()
        obj, _ = Subscription.objects.get_or_create(
            user_id=user_id,
            defaults={"plan": "free"},
        )
        return self._to_entity(obj)

    def get_by_user_id(self, user_id: int) -> Optional[SubscriptionEntity]:
        Subscription = self._get_model()
        try:
            obj = Subscription.objects.get(user_id=user_id)
            return self._to_entity(obj)
        except Subscription.DoesNotExist:
            return None

    def get_by_stripe_customer_id(self, customer_id: str) -> Optional[SubscriptionEntity]:
        Subscription = self._get_model()
        try:
            obj = Subscription.objects.get(stripe_customer_id=customer_id)
            return self._to_entity(obj)
        except Subscription.DoesNotExist:
            return None

    def save(self, entity: SubscriptionEntity) -> SubscriptionEntity:
        Subscription = self._get_model()
        Subscription.objects.filter(user_id=entity.user_id).update(
            plan=entity.plan.value,
            stripe_customer_id=entity.stripe_customer_id,
            stripe_subscription_id=entity.stripe_subscription_id,
            stripe_status=entity.stripe_status,
            current_period_end=entity.current_period_end,
            cancel_at_period_end=entity.cancel_at_period_end,
            used_storage_bytes=entity.used_storage_bytes,
            used_processing_seconds=entity.used_processing_seconds,
            used_ai_answers=entity.used_ai_answers,
            usage_period_start=entity.usage_period_start,
            custom_storage_gb=entity.custom_storage_gb,
            custom_processing_minutes=entity.custom_processing_minutes,
            custom_ai_answers=entity.custom_ai_answers,
            unlimited_processing_minutes=entity.unlimited_processing_minutes,
            unlimited_ai_answers=entity.unlimited_ai_answers,
        )
        return entity

    def create_stripe_customer(self, user_id: int, customer_id: str) -> SubscriptionEntity:
        Subscription = self._get_model()
        Subscription.objects.filter(user_id=user_id).update(
            stripe_customer_id=customer_id
        )
        return self.get_or_create(user_id)

    def reset_monthly_usage(self, user_id: int, period_start) -> None:
        Subscription = self._get_model()
        Subscription.objects.filter(user_id=user_id).update(
            used_processing_seconds=0,
            used_ai_answers=0,
            usage_period_start=period_start,
        )

    def increment_storage_bytes(self, user_id: int, bytes_delta: int) -> None:
        Subscription = self._get_model()
        Subscription.objects.filter(user_id=user_id).update(
            used_storage_bytes=Greatest(Value(0), F("used_storage_bytes") + bytes_delta)
        )

    def increment_processing_seconds(self, user_id: int, seconds: int) -> None:
        Subscription = self._get_model()
        Subscription.objects.filter(user_id=user_id).update(
            used_processing_seconds=F("used_processing_seconds") + seconds
        )

    def increment_ai_answers(self, user_id: int) -> None:
        Subscription = self._get_model()
        Subscription.objects.filter(user_id=user_id).update(
            used_ai_answers=F("used_ai_answers") + 1
        )

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

        is_paid = entity.current_period_end is not None

        if is_paid:
            # Paid users: reset when we've passed period_start + ~1 month
            next_period = period_start + timedelta(days=30)
            if now >= next_period:
                self.reset_monthly_usage(user_id, now)
        else:
            # Free users: reset when calendar month has changed
            if now.year != period_start.year or now.month != period_start.month:
                self.reset_monthly_usage(user_id, now)
