"""Chat context DI wiring.

Lifecycle policy:
- Repositories are created per use-case resolution (lightweight wrappers).
- External/stateless services are process-scoped via cache for reuse.
"""

from functools import lru_cache

from app.infrastructure.chat.keyword_extractor import JanomeNltkKeywordExtractor
from app.infrastructure.external.rag_gateway import RagChatGateway
from app.infrastructure.repositories.django_chat_repository import (
    DjangoChatRepository,
    DjangoVideoGroupQueryRepository,
)
from app.infrastructure.tasks.task_gateway import CeleryEvaluationTaskGateway
from app.use_cases.chat.export_history import ExportChatHistoryUseCase
from app.use_cases.chat.get_analytics import GetChatAnalyticsUseCase
from app.use_cases.chat.get_history import GetChatHistoryUseCase
from app.use_cases.chat.send_message import SendMessageUseCase
from app.use_cases.chat.submit_feedback import SubmitFeedbackUseCase
from app.composition_root import limits as _limits_cr


def _new_chat_repository() -> DjangoChatRepository:
    # Request/resolve scoped: lightweight ORM wrapper.
    return DjangoChatRepository()


def _new_video_group_query_repository() -> DjangoVideoGroupQueryRepository:
    # Request/resolve scoped: lightweight ORM wrapper.
    return DjangoVideoGroupQueryRepository()


@lru_cache(maxsize=1)
def _get_rag_gateway() -> RagChatGateway:
    return RagChatGateway()


@lru_cache(maxsize=1)
def _get_keyword_extractor() -> JanomeNltkKeywordExtractor:
    return JanomeNltkKeywordExtractor()


@lru_cache(maxsize=1)
def _get_evaluation_task_gateway() -> CeleryEvaluationTaskGateway:
    return CeleryEvaluationTaskGateway()


def get_send_message_use_case() -> SendMessageUseCase:
    return SendMessageUseCase(
        _new_chat_repository(),
        _new_video_group_query_repository(),
        _get_rag_gateway(),
        ai_answer_limit_check_use_case=_limits_cr.get_check_ai_answers_limit_use_case(),
        ai_answer_record_use_case=_limits_cr.get_record_ai_answer_usage_use_case(),
        evaluation_task_gateway=_get_evaluation_task_gateway(),
    )

def get_chat_history_use_case() -> GetChatHistoryUseCase:
    return GetChatHistoryUseCase(
        _new_chat_repository(),
        _new_video_group_query_repository(),
    )


def get_chat_analytics_use_case() -> GetChatAnalyticsUseCase:
    return GetChatAnalyticsUseCase(
        _new_chat_repository(),
        _new_video_group_query_repository(),
        _get_keyword_extractor(),
    )


def get_submit_feedback_use_case() -> SubmitFeedbackUseCase:
    return SubmitFeedbackUseCase(_new_chat_repository())


def get_export_history_use_case() -> ExportChatHistoryUseCase:
    return ExportChatHistoryUseCase(
        _new_chat_repository(),
        _new_video_group_query_repository(),
    )
