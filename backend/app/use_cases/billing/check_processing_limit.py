from app.domain.billing.exceptions import ProcessingLimitExceeded
from app.domain.billing.ports import UserLimitsRepository


class CheckProcessingLimitUseCase:
    def __init__(self, user_limits_repo: UserLimitsRepository):
        self._user_limits_repo = user_limits_repo

    def execute(self, user_id: int, additional_seconds: int) -> None:
        entity = self._user_limits_repo.get_or_create(user_id)
        if not entity.can_process(additional_seconds):
            raise ProcessingLimitExceeded(
                f"Processing limit exceeded. Limit: {entity.get_processing_limit_seconds()} seconds."
            )
