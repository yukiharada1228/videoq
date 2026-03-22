"""Chat context DI wiring.

Lifecycle policy:
- Repositories are created per use-case resolution (lightweight wrappers).
- External/stateless services are process-scoped via cache for reuse.
"""

from functools import lru_cache

from app.infrastructure.repositories.django_openai_key_repository import (
    DjangoOpenAiApiKeyRepository,
)
from app.infrastructure.chat.keyword_extractor import JanomeNltkKeywordExtractor
from app.infrastructure.chat.scene_video_info_provider import (
    DjangoSceneVideoInfoProvider,
)
from app.infrastructure.external.file_url_resolver import DjangoFileUrlResolver
from app.infrastructure.external.rag_gateway import RagChatGateway
from app.infrastructure.repositories.django_chat_repository import (
    DjangoChatRepository,
    DjangoVideoGroupQueryRepository,
)
from app.infrastructure.repositories.django_video_repository import DjangoVideoRepository
from app.use_cases.chat.export_history import ExportChatHistoryUseCase
from app.use_cases.chat.get_analytics import GetChatAnalyticsUseCase
from app.use_cases.chat.get_history import GetChatHistoryUseCase
from app.use_cases.chat.get_popular_scenes import GetPopularScenesUseCase
from app.use_cases.chat.send_message import SendMessageUseCase
from app.use_cases.chat.submit_feedback import SubmitFeedbackUseCase


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
def _get_scene_video_info_provider() -> DjangoSceneVideoInfoProvider:
    return DjangoSceneVideoInfoProvider(
        video_repo=DjangoVideoRepository(),
        file_url_resolver=DjangoFileUrlResolver(),
    )


def get_send_message_use_case() -> SendMessageUseCase:
    return SendMessageUseCase(
        _new_chat_repository(),
        _new_video_group_query_repository(),
        _get_rag_gateway(),
        api_key_repo=DjangoOpenAiApiKeyRepository(),
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


def get_popular_scenes_use_case() -> GetPopularScenesUseCase:
    return GetPopularScenesUseCase(
        _new_chat_repository(),
        _new_video_group_query_repository(),
        _get_scene_video_info_provider(),
    )


def get_submit_feedback_use_case() -> SubmitFeedbackUseCase:
    return SubmitFeedbackUseCase(_new_chat_repository())


def get_export_history_use_case() -> ExportChatHistoryUseCase:
    return ExportChatHistoryUseCase(
        _new_chat_repository(),
        _new_video_group_query_repository(),
    )
