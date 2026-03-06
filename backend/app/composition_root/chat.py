"""Chat context DI wiring."""

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


def get_send_message_use_case() -> SendMessageUseCase:
    return SendMessageUseCase(
        DjangoChatRepository(),
        DjangoVideoGroupQueryRepository(),
        RagChatGateway(),
    )


def get_chat_history_use_case() -> GetChatHistoryUseCase:
    return GetChatHistoryUseCase(DjangoChatRepository(), DjangoVideoGroupQueryRepository())


def get_chat_analytics_use_case() -> GetChatAnalyticsUseCase:
    return GetChatAnalyticsUseCase(
        DjangoChatRepository(),
        DjangoVideoGroupQueryRepository(),
        JanomeNltkKeywordExtractor(),
    )


def get_popular_scenes_use_case() -> GetPopularScenesUseCase:
    return GetPopularScenesUseCase(
        DjangoChatRepository(),
        DjangoVideoGroupQueryRepository(),
        DjangoSceneVideoInfoProvider(
            video_repo=DjangoVideoRepository(),
            file_url_resolver=DjangoFileUrlResolver(),
        ),
    )


def get_submit_feedback_use_case() -> SubmitFeedbackUseCase:
    return SubmitFeedbackUseCase(DjangoChatRepository())


def get_export_history_use_case() -> ExportChatHistoryUseCase:
    return ExportChatHistoryUseCase(DjangoChatRepository(), DjangoVideoGroupQueryRepository())
