from django.urls import path

from .views import ChatView, ChatHistoryView

urlpatterns = [
    path("", ChatView.as_view(), name="chat"),
    path("history/", ChatHistoryView.as_view(), name="chat-history"),
]
