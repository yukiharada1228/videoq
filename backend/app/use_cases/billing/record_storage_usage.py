from app.domain.billing.ports import UserLimitsRepository


class RecordStorageUsageUseCase:
    def __init__(self, user_limits_repo: UserLimitsRepository):
        self._user_limits_repo = user_limits_repo

    def execute(self, user_id: int, bytes_delta: int) -> None:
        self._user_limits_repo.increment_storage_bytes(user_id, bytes_delta)
