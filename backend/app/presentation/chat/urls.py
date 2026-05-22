from django.urls import path

from app.dependencies import chat as chat_dependencies

from .views import (
    ChatGroupAnalyticsKeywordsView,
    ChatGroupAnalyticsView,
    ChatGroupHistoryView,
    ChatLogFeedbackView,
    ChatView,
    StreamChatView,
)

urlpatterns = [
    path(
        "messages/",
        ChatView.as_view(send_message_use_case=chat_dependencies.get_send_message_use_case),
        name="chat-messages",
    ),
    path(
        "messages/stream/",
        StreamChatView.as_view(send_message_use_case=chat_dependencies.get_send_message_use_case),
        name="chat-messages-stream",
    ),
    path(
        "groups/<int:group_id>/history/",
        ChatGroupHistoryView.as_view(
            chat_history_use_case=chat_dependencies.get_chat_history_use_case,
            export_history_use_case=chat_dependencies.get_export_history_use_case,
            reset_history_use_case=chat_dependencies.get_reset_history_use_case,
        ),
        name="chat-group-history",
    ),
    path(
        "logs/<int:log_id>/feedback/",
        ChatLogFeedbackView.as_view(
            submit_feedback_use_case=chat_dependencies.get_submit_feedback_use_case
        ),
        name="chat-log-feedback",
    ),
    path(
        "groups/<int:group_id>/analytics/",
        ChatGroupAnalyticsView.as_view(
            chat_analytics_use_case=chat_dependencies.get_chat_analytics_use_case
        ),
        name="chat-group-analytics",
    ),
    path(
        "groups/<int:group_id>/analytics/keywords/",
        ChatGroupAnalyticsKeywordsView.as_view(
            chat_keywords_use_case=chat_dependencies.get_chat_keywords_use_case
        ),
        name="chat-group-analytics-keywords",
    ),
]
