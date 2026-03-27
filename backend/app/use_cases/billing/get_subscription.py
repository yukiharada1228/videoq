from app.domain.billing.ports import SubscriptionRepository
from app.use_cases.billing.dtos import SubscriptionDTO


class GetSubscriptionUseCase:
    def __init__(self, subscription_repo: SubscriptionRepository):
        self._subscription_repo = subscription_repo

    def execute(self, user_id: int) -> SubscriptionDTO:
        entity = self._subscription_repo.get_or_create(user_id)

        return SubscriptionDTO(
            plan=entity.plan.value,
            stripe_status=entity.stripe_status,
            current_period_end=entity.current_period_end,
            cancel_at_period_end=entity.cancel_at_period_end,
            is_active=entity.is_stripe_active,
            used_storage_bytes=entity.used_storage_bytes,
            used_processing_seconds=entity.used_processing_seconds,
            used_ai_answers=entity.used_ai_answers,
            storage_limit_bytes=entity.get_storage_limit_bytes(),
            processing_limit_seconds=entity.get_processing_limit_seconds(),
            ai_answers_limit=entity.get_ai_answers_limit(),
            is_over_quota=entity.is_over_quota,
        )
