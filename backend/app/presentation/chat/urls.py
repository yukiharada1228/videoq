from django.urls import path

from app.dependencies import chat as chat_dependencies

from .views import (
    ChatAnalyticsView,
    ChatFeedbackView,
    ChatHistoryView,
    ChatSearchView,
    ChatView,
    PopularScenesView,
)

urlpatterns = [
    path(
        "",
        ChatView.as_view(send_message_use_case=chat_dependencies.get_send_message_use_case),
        name="chat",
    ),
    path(
        "scenes/",
        ChatSearchView.as_view(
            search_related_videos_use_case=chat_dependencies.get_search_related_videos_use_case
        ),
        name="chat-scenes",
    ),
    path(
        "history/",
        ChatHistoryView.as_view(
            chat_history_use_case=chat_dependencies.get_chat_history_use_case,
            export_history_use_case=chat_dependencies.get_export_history_use_case,
        ),
        name="chat-history",
    ),
    path(
        "feedback/",
        ChatFeedbackView.as_view(
            submit_feedback_use_case=chat_dependencies.get_submit_feedback_use_case
        ),
        name="chat-feedback",
    ),
    path(
        "popular-scenes/",
        PopularScenesView.as_view(
            popular_scenes_use_case=chat_dependencies.get_popular_scenes_use_case
        ),
        name="popular-scenes",
    ),
    path(
        "analytics/",
        ChatAnalyticsView.as_view(
            chat_analytics_use_case=chat_dependencies.get_chat_analytics_use_case
        ),
        name="chat-analytics",
    ),
]
