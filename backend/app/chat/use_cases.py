from dataclasses import dataclass

from app.chat.ports import (ActorLoader, ChatAnalyticsBuilder,
                            ChatFeedbackUpdater, ChatLogsLoader,
                            ChatResponsePayloadBuilder, LlmLoader,
                            PopularScenesBuilder, RagChatServiceFactory,
                            VideoGroupLoader)


def _extract_request_locale(accept_language: str):
    return (
        accept_language.split(",")[0].split(";")[0].strip() if accept_language else ""
    ) or None


# ── Send Chat Message ──


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
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        video_group_loader: VideoGroupLoader,
        llm_loader: LlmLoader,
        rag_chat_service_factory: RagChatServiceFactory,
        chat_response_payload_builder: ChatResponsePayloadBuilder,
    ):
        self._actor_loader = actor_loader
        self._video_group_loader = video_group_loader
        self._llm_loader = llm_loader
        self._rag_chat_service_factory = rag_chat_service_factory
        self._chat_response_payload_builder = chat_response_payload_builder

    def execute(self, command: SendChatMessageCommand) -> ChatMessageResult:
        is_shared = command.share_token is not None
        if is_shared:
            if not command.group_id:
                raise ValueError("Group ID not specified")
            try:
                group = self._video_group_loader(
                    command.group_id,
                    share_token=command.share_token,
                )
            except Exception as exc:
                raise LookupError("Shared group not found") from exc
            user = group.user
        else:
            if command.actor_id is None:
                raise ValueError("Authenticated user not found")
            user = self._actor_loader(command.actor_id)
            group = None

        if not command.messages:
            raise ValueError("Messages are empty")

        llm = self._llm_loader(user)

        if command.group_id is not None and not is_shared:
            try:
                group = self._video_group_loader(command.group_id, user_id=user.id)
            except Exception as exc:
                raise LookupError("Specified group not found") from exc

        service = self._rag_chat_service_factory(user=user, llm=llm)
        result = service.run(
            messages=command.messages,
            group=group if command.group_id is not None else None,
            locale=_extract_request_locale(command.accept_language),
        )
        response_data = self._chat_response_payload_builder(
            result,
            command.group_id,
            group,
            user,
            is_shared,
        )
        return ChatMessageResult(response_data=response_data)


# ── Update Chat Feedback ──


@dataclass(frozen=True)
class UpdateChatFeedbackCommand:
    actor_id: int | None
    chat_log_id: int | None
    feedback: str | None
    share_token: str | None = None


@dataclass(frozen=True)
class ChatFeedbackResult:
    chat_log_id: int
    feedback: str | None


class UpdateChatFeedbackUseCase:
    _valid_feedback = {None, "good", "bad"}

    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        chat_feedback_updater: ChatFeedbackUpdater,
    ):
        self._actor_loader = actor_loader
        self._chat_feedback_updater = chat_feedback_updater

    def execute(self, command: UpdateChatFeedbackCommand):
        if command.chat_log_id is None:
            raise ValueError("chat_log_id not specified")
        feedback = None if command.feedback == "" else command.feedback
        if feedback not in self._valid_feedback:
            raise ValueError("feedback must be 'good', 'bad', or null (unspecified)")

        request_user = (
            self._actor_loader(command.actor_id)
            if command.actor_id is not None
            else None
        )
        chat_log = self._chat_feedback_updater(
            chat_log_id=command.chat_log_id,
            feedback=feedback,
            request_user=request_user,
            share_token=command.share_token,
        )
        return ChatFeedbackResult(chat_log_id=chat_log.id, feedback=chat_log.feedback)


# ── Get Popular Scenes ──


@dataclass(frozen=True)
class GetPopularScenesQuery:
    actor_id: int | None
    group_id: int | None
    share_token: str | None = None
    limit: int = 20


class GetPopularScenesUseCase:
    def __init__(
        self,
        *,
        video_group_loader: VideoGroupLoader,
        popular_scenes_builder: PopularScenesBuilder,
    ):
        self._video_group_loader = video_group_loader
        self._popular_scenes_builder = popular_scenes_builder

    def execute(self, query: GetPopularScenesQuery):
        if not query.group_id:
            raise ValueError("Group ID not specified")
        try:
            if query.share_token:
                group = self._video_group_loader(
                    query.group_id, share_token=query.share_token
                )
            else:
                group = self._video_group_loader(query.group_id, user_id=query.actor_id)
        except Exception as exc:
            raise LookupError("Specified group not found") from exc
        return self._popular_scenes_builder(group, limit=query.limit)


# ── Get Chat Analytics ──


@dataclass(frozen=True)
class GetChatAnalyticsQuery:
    actor_id: int | None
    group_id: int | None


class GetChatAnalyticsUseCase:
    def __init__(
        self,
        *,
        video_group_loader: VideoGroupLoader,
        chat_analytics_builder: ChatAnalyticsBuilder,
    ):
        self._video_group_loader = video_group_loader
        self._chat_analytics_builder = chat_analytics_builder

    def execute(self, query: GetChatAnalyticsQuery):
        if not query.group_id:
            raise ValueError("Group ID not specified")
        try:
            group = self._video_group_loader(query.group_id, user_id=query.actor_id)
        except Exception as exc:
            raise LookupError("Specified group not found") from exc
        return self._chat_analytics_builder(group)


# ── Get Chat History ──


@dataclass(frozen=True)
class GetChatHistoryQuery:
    actor_id: int
    group_id: int | None


class GetChatHistoryUseCase:
    def __init__(
        self,
        *,
        video_group_loader: VideoGroupLoader,
        chat_logs_loader: ChatLogsLoader,
    ):
        self._video_group_loader = video_group_loader
        self._chat_logs_loader = chat_logs_loader

    def execute(self, query: GetChatHistoryQuery):
        if not query.group_id:
            return []
        try:
            group = self._video_group_loader(query.group_id, user_id=query.actor_id)
        except Exception:
            return []
        return self._chat_logs_loader(group, ascending=False)


# ── Export Chat History ──


@dataclass(frozen=True)
class ExportChatHistoryQuery:
    actor_id: int
    group_id: int | None


class ExportChatHistoryUseCase:
    def __init__(
        self,
        *,
        video_group_loader: VideoGroupLoader,
        chat_logs_loader: ChatLogsLoader,
    ):
        self._video_group_loader = video_group_loader
        self._chat_logs_loader = chat_logs_loader

    def execute(self, query: ExportChatHistoryQuery):
        if not query.group_id:
            raise ValueError("Group ID not specified")
        group = self._video_group_loader(query.group_id, user_id=query.actor_id)
        logs = self._chat_logs_loader(group, ascending=True)
        return group, logs
