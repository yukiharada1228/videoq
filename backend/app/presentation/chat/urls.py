from django.urls import path

from app.dependencies import chat as chat_dependencies

from .views import (
    ChatAnalyticsView,
    ChatFeedbackView,
    ChatHistoryView,
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
        "analytics/",
        ChatAnalyticsView.as_view(
            chat_analytics_use_case=chat_dependencies.get_chat_analytics_use_case
        ),
        name="chat-analytics",
    ),
]
