from app.domain.billing.ports import SubscriptionRepository


class RecordProcessingUsageUseCase:
    def __init__(self, subscription_repo: SubscriptionRepository):
        self._subscription_repo = subscription_repo

    def execute(self, user_id: int, seconds: int) -> None:
        self._subscription_repo.maybe_reset_monthly_usage(user_id)
        entity = self._subscription_repo.get_or_create(user_id)
        entity.used_processing_seconds += seconds
        self._subscription_repo.save(entity)
