from app.domain.billing.ports import SubscriptionRepository


class RecordProcessingUsageUseCase:
    def __init__(self, subscription_repo: SubscriptionRepository):
        self._subscription_repo = subscription_repo

    def execute(self, user_id: int, seconds: int) -> None:
        self._subscription_repo.maybe_reset_monthly_usage(user_id)
        self._subscription_repo.increment_processing_seconds(user_id, seconds)
