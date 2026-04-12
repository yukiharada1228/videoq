from app.domain.billing.ports import UserLimitsRepository


class ClearOverQuotaIfWithinLimitUseCase:
    """Clears the is_over_quota flag if the user's storage is now within their configured limit.

    Called after a video deletion to re-enable AI chat and uploads when the user
    has freed enough storage to fall back within their configured limit.
    """

    def __init__(self, user_limits_repo: UserLimitsRepository):
        self._user_limits_repo = user_limits_repo

    def execute(self, user_id: int) -> None:
        self._user_limits_repo.clear_over_quota_if_within_limit(user_id)
