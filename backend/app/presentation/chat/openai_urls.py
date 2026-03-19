from django.urls import path

from app.dependencies import chat as chat_dependencies

from .views import OpenAIChatCompletionsView

urlpatterns = [
    path(
        "chat/completions",
        OpenAIChatCompletionsView.as_view(
            send_message_use_case=chat_dependencies.get_send_message_use_case
        ),
        name="openai-chat-completions",
    ),
]
