from django.urls import path

from .views import ChatView, ChatHistoryView, ChatHistoryExportView

urlpatterns = [
    path("", ChatView.as_view(), name="chat"),
    path("history/", ChatHistoryView.as_view(), name="chat-history"),
    path("history/export/", ChatHistoryExportView.as_view(), name="chat-history-export"),
]
