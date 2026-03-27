from app.domain.billing.ports import SubscriptionRepository


class ClearOverQuotaIfWithinLimitUseCase:
    """Clears the is_over_quota flag if the user's storage is now within their plan limit.

    Called after a video deletion to re-enable AI chat and uploads when the user
    has freed enough storage to fall back within their plan limit.
    """

    def __init__(self, subscription_repo: SubscriptionRepository):
        self._subscription_repo = subscription_repo

    def execute(self, user_id: int) -> None:
        self._subscription_repo.clear_over_quota_if_within_limit(user_id)
