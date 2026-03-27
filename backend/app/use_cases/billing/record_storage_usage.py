from app.domain.billing.ports import SubscriptionRepository


class RecordStorageUsageUseCase:
    def __init__(self, subscription_repo: SubscriptionRepository):
        self._subscription_repo = subscription_repo

    def execute(self, user_id: int, bytes_delta: int) -> None:
        self._subscription_repo.increment_storage_bytes(user_id, bytes_delta)
