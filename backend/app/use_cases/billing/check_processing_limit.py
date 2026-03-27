from app.domain.billing.exceptions import ProcessingLimitExceeded
from app.domain.billing.ports import SubscriptionRepository


class CheckProcessingLimitUseCase:
    def __init__(self, subscription_repo: SubscriptionRepository):
        self._subscription_repo = subscription_repo

    def execute(self, user_id: int, additional_seconds: int) -> None:
        entity = self._subscription_repo.get_or_create(user_id)
        if not entity.can_process(additional_seconds):
            raise ProcessingLimitExceeded(
                f"Processing limit exceeded. Limit: {entity.get_processing_limit_seconds()} seconds."
            )
