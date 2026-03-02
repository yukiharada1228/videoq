from dataclasses import dataclass

from app.chat.ports import (ChatAnalyticsGetter, ChatFeedbackUpdater,
                            ChatMessageSender, PopularScenesGetter)


@dataclass(frozen=True)
class SendChatMessageCommand:
    request_user: object
    messages: list
    group_id: int | None = None
    share_token: str | None = None
    accept_language: str = ""


@dataclass(frozen=True)
class ChatMessageResult:
    response_data: dict


class SendChatMessageUseCase:
    def __init__(self, *, chat_message_sender: ChatMessageSender):
        self._chat_message_sender = chat_message_sender

    def execute(self, command: SendChatMessageCommand) -> ChatMessageResult:
        response_data = self._chat_message_sender(command)
        return ChatMessageResult(response_data=response_data)


@dataclass(frozen=True)
class UpdateChatFeedbackCommand:
    request_user: object
    chat_log_id: int | None
    feedback: str | None
    share_token: str | None = None


class UpdateChatFeedbackUseCase:
    _valid_feedback = {None, "good", "bad"}

    def __init__(self, *, chat_feedback_updater: ChatFeedbackUpdater):
        self._chat_feedback_updater = chat_feedback_updater

    def execute(self, command: UpdateChatFeedbackCommand):
        if command.chat_log_id is None:
            raise ValueError("chat_log_id not specified")
        feedback = None if command.feedback == "" else command.feedback
        if feedback not in self._valid_feedback:
            raise ValueError("feedback must be 'good', 'bad', or null (unspecified)")

        normalized_command = UpdateChatFeedbackCommand(
            request_user=command.request_user,
            share_token=command.share_token,
            chat_log_id=command.chat_log_id,
            feedback=feedback,
        )
        return self._chat_feedback_updater(normalized_command)


@dataclass(frozen=True)
class ChatFeedbackResult:
    chat_log_id: int
    feedback: str | None


@dataclass(frozen=True)
class GetPopularScenesQuery:
    request_user: object
    group_id: int | None
    share_token: str | None = None
    limit: int = 20


class GetPopularScenesUseCase:
    def __init__(self, *, popular_scenes_getter: PopularScenesGetter):
        self._popular_scenes_getter = popular_scenes_getter

    def execute(self, query: GetPopularScenesQuery):
        if not query.group_id:
            raise ValueError("Group ID not specified")
        return self._popular_scenes_getter(query)


@dataclass(frozen=True)
class GetChatAnalyticsQuery:
    request_user: object
    group_id: int | None


class GetChatAnalyticsUseCase:
    def __init__(self, *, chat_analytics_getter: ChatAnalyticsGetter):
        self._chat_analytics_getter = chat_analytics_getter

    def execute(self, query: GetChatAnalyticsQuery):
        if not query.group_id:
            raise ValueError("Group ID not specified")
        return self._chat_analytics_getter(query)
