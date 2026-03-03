from typing import Protocol

from app.common.ports import ActorLoader  # noqa: F401 – re-exported


class VideoGroupLoader(Protocol):
    def __call__(
        self,
        group_id: int,
        *,
        user_id: int | None = None,
        share_token: str | None = None
    ): ...


class LlmLoader(Protocol):
    def __call__(self, user): ...


class RagChatServiceFactory(Protocol):
    def __call__(self, *, user, llm): ...


class ChatResponsePayloadBuilder(Protocol):
    def __call__(self, result, group_id, group, user, is_shared) -> dict: ...


class ChatFeedbackUpdater(Protocol):
    def __call__(
        self,
        *,
        chat_log_id: int,
        feedback: str | None,
        request_user=None,
        share_token: str | None = None
    ): ...


class PopularScenesBuilder(Protocol):
    def __call__(self, group, *, limit: int = 20) -> list: ...


class ChatAnalyticsBuilder(Protocol):
    def __call__(self, group) -> dict: ...


class ChatLogsLoader(Protocol):
    def __call__(self, group, *, ascending: bool = True): ...
