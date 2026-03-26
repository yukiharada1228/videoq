from app.domain.billing.exceptions import StorageLimitExceeded
from app.domain.billing.ports import SubscriptionRepository


class CheckStorageLimitUseCase:
    def __init__(self, subscription_repo: SubscriptionRepository):
        self._subscription_repo = subscription_repo

    def execute(self, user_id: int, additional_bytes: int) -> None:
        entity = self._subscription_repo.get_or_create(user_id)
        if not entity.can_use_storage(additional_bytes):
            raise StorageLimitExceeded(
                f"Storage limit exceeded. Limit: {entity.get_storage_limit_bytes()} bytes."
            )
