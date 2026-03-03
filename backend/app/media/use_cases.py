from dataclasses import dataclass

from app.media.ports import (ActorLoader, MediaFileResolver,
                             VideoAccessAuthorizer)


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
    def __init__(
        self,
        *,
        media_file_resolver: MediaFileResolver,
        video_access_authorizer: VideoAccessAuthorizer,
        actor_loader: ActorLoader,
    ):
        self._media_file_resolver = media_file_resolver
        self._video_access_authorizer = video_access_authorizer
        self._actor_loader = actor_loader

    def execute(self, query: GetProtectedMediaQuery) -> ProtectedMediaResult:
        file_path, video = self._media_file_resolver(query.path)
        request_user = (
            self._actor_loader(query.actor_id) if query.actor_id is not None else None
        )
        self._video_access_authorizer(
            video=video,
            request_user=request_user,
            share_group=query.share_group,
        )
        return ProtectedMediaResult(file_path=file_path, video=video)
