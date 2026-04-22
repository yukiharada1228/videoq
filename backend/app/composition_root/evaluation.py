"""Evaluation context DI wiring."""

from functools import lru_cache

from app.infrastructure.evaluation.ragas_gateway import RagasEvaluationGateway
from app.infrastructure.repositories.django_chat_log_for_evaluation_repository import (
    DjangoChatLogForEvaluationRepository,
)
from app.infrastructure.repositories.django_evaluation_repository import (
    DjangoChatLogEvaluationRepository,
)
from app.infrastructure.repositories.django_video_group_ownership_repository import (
    DjangoVideoGroupOwnershipRepository,
)
from app.use_cases.evaluation.evaluate_chat_log import EvaluateChatLogUseCase
from app.use_cases.evaluation.get_evaluation_summary import GetEvaluationSummaryUseCase
from app.use_cases.evaluation.list_chat_log_evaluations import ListChatLogEvaluationsUseCase


@lru_cache(maxsize=1)
def _get_ragas_gateway() -> RagasEvaluationGateway:
    return RagasEvaluationGateway()


def get_evaluate_chat_log_use_case() -> EvaluateChatLogUseCase:
    return EvaluateChatLogUseCase(
        chat_log_repo=DjangoChatLogForEvaluationRepository(),
        evaluation_repo=DjangoChatLogEvaluationRepository(),
        evaluation_gateway=_get_ragas_gateway(),
    )


def get_get_evaluation_summary_use_case() -> GetEvaluationSummaryUseCase:
    return GetEvaluationSummaryUseCase(
        evaluation_repo=DjangoChatLogEvaluationRepository(),
        group_ownership=DjangoVideoGroupOwnershipRepository(),
    )


def get_list_chat_log_evaluations_use_case() -> ListChatLogEvaluationsUseCase:
    return ListChatLogEvaluationsUseCase(
        evaluation_repo=DjangoChatLogEvaluationRepository(),
        group_ownership=DjangoVideoGroupOwnershipRepository(),
    )
