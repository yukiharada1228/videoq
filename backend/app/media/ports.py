from typing import Protocol


class ProtectedMediaGetter(Protocol):
    def __call__(self, query): ...
