from django.contrib.auth import get_user_model

from app.chat.repositories import (get_chat_logs_queryset,
                                   get_video_group_with_members)
from app.chat.services import (RagChatService, build_chat_analytics,
                               build_popular_scenes,
                               create_chat_response_payload, get_langchain_llm,
                               update_chat_feedback)
from app.chat.use_cases import (ExportChatHistoryUseCase,
                                GetChatAnalyticsUseCase, GetChatHistoryUseCase,
                                GetPopularScenesUseCase,
                                SendChatMessageUseCase,
                                UpdateChatFeedbackUseCase)
from app.common.actors import DjangoActorLoader

User = get_user_model()
_actor_loader = DjangoActorLoader(User)


def send_chat_message_use_case() -> SendChatMessageUseCase:
    return SendChatMessageUseCase(
        actor_loader=_actor_loader,
        video_group_loader=get_video_group_with_members,
        llm_loader=get_langchain_llm,
        rag_chat_service_factory=RagChatService,
        chat_response_payload_builder=create_chat_response_payload,
    )


def update_chat_feedback_use_case() -> UpdateChatFeedbackUseCase:
    return UpdateChatFeedbackUseCase(
        actor_loader=_actor_loader,
        chat_feedback_updater=update_chat_feedback,
    )


def get_popular_scenes_use_case() -> GetPopularScenesUseCase:
    return GetPopularScenesUseCase(
        video_group_loader=get_video_group_with_members,
        popular_scenes_builder=build_popular_scenes,
    )


def get_chat_analytics_use_case() -> GetChatAnalyticsUseCase:
    return GetChatAnalyticsUseCase(
        video_group_loader=get_video_group_with_members,
        chat_analytics_builder=build_chat_analytics,
    )


def get_chat_history_use_case() -> GetChatHistoryUseCase:
    return GetChatHistoryUseCase(
        video_group_loader=get_video_group_with_members,
        chat_logs_loader=get_chat_logs_queryset,
    )


def export_chat_history_use_case() -> ExportChatHistoryUseCase:
    return ExportChatHistoryUseCase(
        video_group_loader=get_video_group_with_members,
        chat_logs_loader=get_chat_logs_queryset,
    )
