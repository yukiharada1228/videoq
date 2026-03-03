from typing import Protocol

from app.common.ports import ActorLoader  # noqa: F401 – re-exported


class OwnedVideoLoader(Protocol):
    def __call__(self, *, user, video_id: int): ...


class OwnedVideosLoader(Protocol):
    def __call__(self, *, user, video_ids: list[int]) -> list: ...


class OwnedGroupLoader(Protocol):
    def __call__(self, *, user, group_id: int): ...


class OwnedTagLoader(Protocol):
    def __call__(self, *, user, tag_id: int): ...


class OwnedTagsLoader(Protocol):
    def __call__(self, *, user, tag_ids: list[int]) -> list: ...


class UploadLimitChecker(Protocol):
    def __call__(self, *, user) -> None: ...


class VideoCreator(Protocol):
    def __call__(self, *, user, validated_data: dict): ...


class VideoUpdater(Protocol):
    def __call__(self, *, video, validated_data: dict): ...


class VideoDeleter(Protocol):
    def __call__(self, *, video) -> None: ...


class VideoTitleVectorUpdater(Protocol):
    def __call__(self, video_id: int, new_title: str) -> None: ...


class GroupCreator(Protocol):
    def __call__(self, *, user, validated_data: dict): ...


class GroupUpdater(Protocol):
    def __call__(self, *, group, validated_data: dict): ...


class GroupDeleter(Protocol):
    def __call__(self, *, group) -> None: ...


class GroupMemberAdder(Protocol):
    def __call__(self, group, video): ...


class GroupMembersBulkAdder(Protocol):
    def __call__(self, group, videos, requested_video_ids) -> dict: ...


class GroupMemberRemover(Protocol):
    def __call__(self, *, group, video) -> None: ...


class GroupVideoReorderer(Protocol):
    def __call__(self, group, video_ids: list[int]) -> None: ...


class ShareTokenGenerator(Protocol):
    def __call__(self, nbytes: int = 32) -> str: ...


class ShareTokenSaver(Protocol):
    def __call__(self, *, group, token_value: str | None) -> None: ...


class SharedGroupLoader(Protocol):
    def __call__(self, *, share_token: str): ...


class TagCreator(Protocol):
    def __call__(self, *, user, validated_data: dict): ...


class TagUpdater(Protocol):
    def __call__(self, *, tag, validated_data: dict): ...


class TagDeleter(Protocol):
    def __call__(self, *, tag) -> None: ...


class VideoTagsBulkAdder(Protocol):
    def __call__(self, video, tags, requested_tag_ids) -> dict: ...


class VideoTagRemover(Protocol):
    def __call__(self, *, video, tag) -> None: ...


# ── List / Query Ports ──


class VideosQuerySetLoader(Protocol):
    def __call__(
        self,
        *,
        user_id: int,
        include_transcript: bool = False,
        include_groups: bool = False,
        q: str = "",
        status: str = "",
        tag_ids: list[int] | None = None,
        ordering: str = "",
    ): ...


class VideoGroupsQuerySetLoader(Protocol):
    def __call__(
        self,
        *,
        user_id: int,
        include_videos: bool = True,
        annotate_video_count: bool = True,
    ): ...
