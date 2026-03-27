from app.domain.billing.exceptions import AiAnswersLimitExceeded, OverQuotaError
from app.domain.billing.ports import SubscriptionRepository


class CheckAiAnswersLimitUseCase:
    def __init__(self, subscription_repo: SubscriptionRepository):
        self._subscription_repo = subscription_repo

    def execute(self, user_id: int) -> None:
        entity = self._subscription_repo.get_or_create(user_id)
        if entity.is_over_quota:
            raise OverQuotaError(
                "AI chat is unavailable: account storage is over the plan limit."
            )
        if not entity.can_answer():
            raise AiAnswersLimitExceeded(
                f"AI answers limit exceeded. Limit: {entity.get_ai_answers_limit()}."
            )
