from dataclasses import dataclass

from app.media.ports import ProtectedMediaGetter


@dataclass(frozen=True)
class GetProtectedMediaQuery:
    path: str
    actor_id: int | None = None
    share_group: object = None


@dataclass(frozen=True)
class ProtectedMediaResult:
    file_path: str
    video: object


class GetProtectedMediaUseCase:
    def __init__(self, *, protected_media_getter: ProtectedMediaGetter):
        self._protected_media_getter = protected_media_getter

    def execute(self, query: GetProtectedMediaQuery) -> ProtectedMediaResult:
        file_path, video = self._protected_media_getter(query)
        return ProtectedMediaResult(file_path=file_path, video=video)
