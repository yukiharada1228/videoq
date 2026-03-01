from django.urls import path

from .views import (ChatAnalyticsView, ChatFeedbackView,
                    ChatHistoryExportView, ChatHistoryView, ChatView,
                    PopularScenesView)

urlpatterns = [
    path("", ChatView.as_view(), name="chat"),
    path("history/", ChatHistoryView.as_view(), name="chat-history"),
    path(
        "history/export/", ChatHistoryExportView.as_view(), name="chat-history-export"
    ),
    path("feedback/", ChatFeedbackView.as_view(), name="chat-feedback"),
    path("popular-scenes/", PopularScenesView.as_view(), name="popular-scenes"),
    path("analytics/", ChatAnalyticsView.as_view(), name="chat-analytics"),
]
