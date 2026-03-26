from app.domain.billing.ports import SubscriptionRepository


class RecordStorageUsageUseCase:
    def __init__(self, subscription_repo: SubscriptionRepository):
        self._subscription_repo = subscription_repo

    def execute(self, user_id: int, bytes_delta: int) -> None:
        entity = self._subscription_repo.get_or_create(user_id)
        entity.used_storage_bytes = max(0, entity.used_storage_bytes + bytes_delta)
        self._subscription_repo.save(entity)
