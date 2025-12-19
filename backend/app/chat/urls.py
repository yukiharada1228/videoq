from django.urls import path

from .views import (ChatFeedbackView, ChatHistoryExportView, ChatHistoryView,
                    ChatStreamView, ChatView)

urlpatterns = [
    path("", ChatView.as_view(), name="chat"),
    path("stream/", ChatStreamView.as_view(), name="chat-stream"),
    path("history/", ChatHistoryView.as_view(), name="chat-history"),
    path(
        "history/export/", ChatHistoryExportView.as_view(), name="chat-history-export"
    ),
    path("feedback/", ChatFeedbackView.as_view(), name="chat-feedback"),
]
