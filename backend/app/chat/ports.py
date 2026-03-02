from typing import Protocol


class ChatMessageSender(Protocol):
    def __call__(self, command): ...


class ChatFeedbackUpdater(Protocol):
    def __call__(self, command): ...


class PopularScenesGetter(Protocol):
    def __call__(self, query): ...


class ChatAnalyticsGetter(Protocol):
    def __call__(self, query): ...
