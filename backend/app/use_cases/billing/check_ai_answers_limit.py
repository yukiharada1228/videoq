from app.domain.billing.exceptions import AiAnswersLimitExceeded
from app.domain.billing.ports import SubscriptionRepository
from app.domain.user.ports import OpenAiApiKeyRepository


class CheckAiAnswersLimitUseCase:
    def __init__(
        self,
        subscription_repo: SubscriptionRepository,
        openai_key_repo: OpenAiApiKeyRepository,
    ):
        self._subscription_repo = subscription_repo
        self._openai_key_repo = openai_key_repo

    def execute(self, user_id: int) -> None:
        entity = self._subscription_repo.get_or_create(user_id)
        has_openai_key = self._openai_key_repo.has_key(user_id)
        if not entity.can_answer(has_openai_key):
            raise AiAnswersLimitExceeded(
                f"AI answers limit exceeded. Limit: {entity.get_ai_answers_limit(has_openai_key)}."
            )
