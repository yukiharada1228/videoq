from typing import Protocol

from app.common.ports import ActorLoader  # noqa: F401 – re-exported


class MediaFileResolver(Protocol):
    def __call__(self, path: str) -> tuple[str, object]: ...


class VideoAccessAuthorizer(Protocol):
    def __call__(
        self, *, video: object, request_user: object | None, share_group: object | None
    ) -> None: ...
