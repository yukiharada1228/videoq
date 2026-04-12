from app.domain.billing.ports import UserLimitsRepository


class CheckStorageLimitUseCase:
    def __init__(self, user_limits_repo: UserLimitsRepository):
        self._user_limits_repo = user_limits_repo

    def execute(self, user_id: int, additional_bytes: int) -> None:
        self._user_limits_repo.check_and_reserve_storage(user_id, additional_bytes)
