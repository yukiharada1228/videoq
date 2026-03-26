from app.domain.billing.ports import SubscriptionRepository


class RecordAiAnswerUsageUseCase:
    def __init__(self, subscription_repo: SubscriptionRepository):
        self._subscription_repo = subscription_repo

    def execute(self, user_id: int) -> None:
        self._subscription_repo.maybe_reset_monthly_usage(user_id)
        entity = self._subscription_repo.get_or_create(user_id)
        entity.used_ai_answers += 1
        self._subscription_repo.save(entity)
