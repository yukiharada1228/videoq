from dataclasses import dataclass

from app.chat.ports import (ChatAnalyticsGetter, ChatFeedbackUpdater,
                            ChatMessageSender, PopularScenesGetter)


@dataclass(frozen=True)
class SendChatMessageCommand:
    actor_id: int | None
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
    actor_id: int | None
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
            actor_id=command.actor_id,
            share_token=command.share_token,
            chat_log_id=command.chat_log_id,
            feedback=feedback,
        )
        chat_log = self._chat_feedback_updater(normalized_command)
        return ChatFeedbackResult(chat_log_id=chat_log.id, feedback=chat_log.feedback)


@dataclass(frozen=True)
class ChatFeedbackResult:
    chat_log_id: int
    feedback: str | None


@dataclass(frozen=True)
class GetPopularScenesQuery:
    actor_id: int | None
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
    actor_id: int | None
    group_id: int | None


class GetChatAnalyticsUseCase:
    def __init__(self, *, chat_analytics_getter: ChatAnalyticsGetter):
        self._chat_analytics_getter = chat_analytics_getter

    def execute(self, query: GetChatAnalyticsQuery):
        if not query.group_id:
            raise ValueError("Group ID not specified")
        return self._chat_analytics_getter(query)
