from app.domain.billing.ports import UserLimitsRepository


class RecordAiAnswerUsageUseCase:
    def __init__(self, user_limits_repo: UserLimitsRepository):
        self._user_limits_repo = user_limits_repo

    def execute(self, user_id: int) -> None:
        self._user_limits_repo.maybe_reset_monthly_usage(user_id)
        self._user_limits_repo.increment_ai_answers(user_id)
