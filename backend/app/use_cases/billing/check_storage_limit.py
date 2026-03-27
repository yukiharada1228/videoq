from app.domain.billing.ports import SubscriptionRepository


class CheckStorageLimitUseCase:
    def __init__(self, subscription_repo: SubscriptionRepository):
        self._subscription_repo = subscription_repo

    def execute(self, user_id: int, additional_bytes: int) -> None:
        self._subscription_repo.check_and_reserve_storage(user_id, additional_bytes)
