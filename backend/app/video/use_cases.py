import secrets
from dataclasses import dataclass

from app.video.ports import (ActorLoader, GroupCreator, GroupDeleter,
                             GroupMemberAdder, GroupMemberRemover,
                             GroupMembersBulkAdder, GroupUpdater,
                             GroupVideoReorderer, OwnedGroupLoader,
                             OwnedTagLoader, OwnedTagsLoader, OwnedVideoLoader,
                             OwnedVideosLoader, SharedGroupLoader,
                             ShareTokenSaver, TagCreator, TagDeleter,
                             TagUpdater, UploadLimitChecker, VideoCreator,
                             VideoDeleter, VideoGroupsQuerySetLoader,
                             VideosQuerySetLoader, VideoTagRemover,
                             VideoTagsBulkAdder, VideoTitleVectorUpdater,
                             VideoUpdater)

# ── Upload Video ──


@dataclass(frozen=True)
class UploadVideoCommand:
    actor_id: int
    validated_data: dict


@dataclass(frozen=True)
class UploadVideoResult:
    video_id: int


class UploadVideoUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        upload_limit_checker: UploadLimitChecker,
        video_creator: VideoCreator,
    ):
        self._actor_loader = actor_loader
        self._upload_limit_checker = upload_limit_checker
        self._video_creator = video_creator

    def execute(self, command: UploadVideoCommand) -> UploadVideoResult:
        user = self._actor_loader(command.actor_id)
        self._upload_limit_checker(user=user)
        video = self._video_creator(user=user, validated_data=command.validated_data)
        return UploadVideoResult(video_id=video.id)


# ── Update Video ──


@dataclass(frozen=True)
class UpdateVideoCommand:
    actor_id: int
    video_id: int
    validated_data: dict


class UpdateVideoUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        owned_video_loader: OwnedVideoLoader,
        video_updater: VideoUpdater,
        video_title_vector_updater: VideoTitleVectorUpdater,
    ):
        self._actor_loader = actor_loader
        self._owned_video_loader = owned_video_loader
        self._video_updater = video_updater
        self._video_title_vector_updater = video_title_vector_updater

    def execute(self, command: UpdateVideoCommand):
        user = self._actor_loader(command.actor_id)
        video = self._owned_video_loader(user=user, video_id=command.video_id)
        if not video:
            raise LookupError("Video not found")
        old_title = video.title
        video = self._video_updater(video=video, validated_data=command.validated_data)
        if old_title != video.title:
            self._video_title_vector_updater(video.id, video.title)
        return video


# ── Delete Video ──


@dataclass(frozen=True)
class DeleteVideoCommand:
    actor_id: int
    video_id: int


class DeleteVideoUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        owned_video_loader: OwnedVideoLoader,
        video_deleter: VideoDeleter,
    ):
        self._actor_loader = actor_loader
        self._owned_video_loader = owned_video_loader
        self._video_deleter = video_deleter

    def execute(self, command: DeleteVideoCommand):
        user = self._actor_loader(command.actor_id)
        video = self._owned_video_loader(user=user, video_id=command.video_id)
        if not video:
            raise LookupError("Video not found")
        return self._video_deleter(video=video)


# ── Add Video to Group ──


@dataclass(frozen=True)
class AddVideoToGroupCommand:
    actor_id: int
    group_id: int
    video_id: int


@dataclass(frozen=True)
class AddVideoToGroupResult:
    member_id: int


class AddVideoToGroupUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        owned_group_loader: OwnedGroupLoader,
        owned_video_loader: OwnedVideoLoader,
        group_member_adder: GroupMemberAdder,
    ):
        self._actor_loader = actor_loader
        self._owned_group_loader = owned_group_loader
        self._owned_video_loader = owned_video_loader
        self._group_member_adder = group_member_adder

    def execute(self, command: AddVideoToGroupCommand):
        user = self._actor_loader(command.actor_id)
        group = self._owned_group_loader(user=user, group_id=command.group_id)
        if not group:
            raise LookupError("Group not found")
        video = self._owned_video_loader(user=user, video_id=command.video_id)
        if not video:
            raise LookupError("Video not found")
        member = self._group_member_adder(group, video)
        if member is None:
            raise ValueError("This video is already added to the group")
        return AddVideoToGroupResult(member_id=member.id)


# ── Add Videos to Group ──


@dataclass(frozen=True)
class AddVideosToGroupCommand:
    actor_id: int
    group_id: int
    video_ids: list[int]


@dataclass(frozen=True)
class AddVideosToGroupResult:
    added_count: int
    skipped_count: int


class AddVideosToGroupUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        owned_group_loader: OwnedGroupLoader,
        owned_videos_loader: OwnedVideosLoader,
        group_members_adder: GroupMembersBulkAdder,
    ):
        self._actor_loader = actor_loader
        self._owned_group_loader = owned_group_loader
        self._owned_videos_loader = owned_videos_loader
        self._group_members_adder = group_members_adder

    def execute(self, command: AddVideosToGroupCommand):
        user = self._actor_loader(command.actor_id)
        group = self._owned_group_loader(user=user, group_id=command.group_id)
        if not group:
            raise LookupError("Group not found")
        if not command.video_ids:
            raise ValueError("Video ID not specified")
        videos = self._owned_videos_loader(user=user, video_ids=command.video_ids)
        if len(videos) != len(command.video_ids):
            raise LookupError("Some videos not found")
        result = self._group_members_adder(group, videos, command.video_ids)
        return AddVideosToGroupResult(
            added_count=result["added_count"],
            skipped_count=result["skipped_count"],
        )


# ── Reorder Videos in Group ──


@dataclass(frozen=True)
class ReorderVideosInGroupCommand:
    actor_id: int
    group_id: int
    video_ids: list[int]


class ReorderVideosInGroupUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        owned_group_loader: OwnedGroupLoader,
        group_reorderer: GroupVideoReorderer,
    ):
        self._actor_loader = actor_loader
        self._owned_group_loader = owned_group_loader
        self._group_reorderer = group_reorderer

    def execute(self, command: ReorderVideosInGroupCommand):
        user = self._actor_loader(command.actor_id)
        group = self._owned_group_loader(user=user, group_id=command.group_id)
        if not group:
            raise LookupError("Group not found")
        self._group_reorderer(group, command.video_ids)


# ── Remove Video from Group ──


@dataclass(frozen=True)
class RemoveVideoFromGroupCommand:
    actor_id: int
    group_id: int
    video_id: int


class RemoveVideoFromGroupUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        owned_group_loader: OwnedGroupLoader,
        owned_video_loader: OwnedVideoLoader,
        group_member_remover: GroupMemberRemover,
    ):
        self._actor_loader = actor_loader
        self._owned_group_loader = owned_group_loader
        self._owned_video_loader = owned_video_loader
        self._group_member_remover = group_member_remover

    def execute(self, command: RemoveVideoFromGroupCommand):
        user = self._actor_loader(command.actor_id)
        group = self._owned_group_loader(user=user, group_id=command.group_id)
        if not group:
            raise LookupError("Group not found")
        video = self._owned_video_loader(user=user, video_id=command.video_id)
        if not video:
            raise LookupError("Video not found")
        self._group_member_remover(group=group, video=video)


# ── Create Share Link ──


@dataclass(frozen=True)
class CreateShareLinkCommand:
    actor_id: int
    group_id: int


@dataclass(frozen=True)
class CreateShareLinkResult:
    share_token: str


class CreateShareLinkUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        owned_group_loader: OwnedGroupLoader,
        share_token_saver: ShareTokenSaver,
    ):
        self._actor_loader = actor_loader
        self._owned_group_loader = owned_group_loader
        self._share_token_saver = share_token_saver

    def execute(self, command: CreateShareLinkCommand):
        user = self._actor_loader(command.actor_id)
        group = self._owned_group_loader(user=user, group_id=command.group_id)
        if not group:
            raise LookupError("Group not found")
        share_token = secrets.token_urlsafe(32)
        self._share_token_saver(group=group, token_value=share_token)
        return CreateShareLinkResult(share_token=share_token)


# ── Delete Share Link ──


@dataclass(frozen=True)
class DeleteShareLinkCommand:
    actor_id: int
    group_id: int


class DeleteShareLinkUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        owned_group_loader: OwnedGroupLoader,
        share_token_saver: ShareTokenSaver,
    ):
        self._actor_loader = actor_loader
        self._owned_group_loader = owned_group_loader
        self._share_token_saver = share_token_saver

    def execute(self, command: DeleteShareLinkCommand):
        user = self._actor_loader(command.actor_id)
        group = self._owned_group_loader(user=user, group_id=command.group_id)
        if not group:
            raise LookupError("Group not found")
        if not group.share_token:
            raise LookupError("Share link is not configured")
        self._share_token_saver(group=group, token_value=None)


# ── Get Shared Group ──


@dataclass(frozen=True)
class GetSharedGroupQuery:
    share_token: str


class GetSharedGroupUseCase:
    def __init__(self, *, shared_group_loader: SharedGroupLoader):
        self._shared_group_loader = shared_group_loader

    def execute(self, query: GetSharedGroupQuery):
        return self._shared_group_loader(share_token=query.share_token)


# ── Create Video Group ──


@dataclass(frozen=True)
class CreateVideoGroupCommand:
    actor_id: int
    validated_data: dict


class CreateVideoGroupUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        group_creator: GroupCreator,
    ):
        self._actor_loader = actor_loader
        self._group_creator = group_creator

    def execute(self, command: CreateVideoGroupCommand):
        user = self._actor_loader(command.actor_id)
        return self._group_creator(user=user, validated_data=command.validated_data)


# ── Update Video Group ──


@dataclass(frozen=True)
class UpdateVideoGroupCommand:
    actor_id: int
    group_id: int
    validated_data: dict


class UpdateVideoGroupUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        owned_group_loader: OwnedGroupLoader,
        group_updater: GroupUpdater,
    ):
        self._actor_loader = actor_loader
        self._owned_group_loader = owned_group_loader
        self._group_updater = group_updater

    def execute(self, command: UpdateVideoGroupCommand):
        user = self._actor_loader(command.actor_id)
        group = self._owned_group_loader(user=user, group_id=command.group_id)
        if not group:
            raise LookupError("Group not found")
        return self._group_updater(group=group, validated_data=command.validated_data)


# ── Delete Video Group ──


@dataclass(frozen=True)
class DeleteVideoGroupCommand:
    actor_id: int
    group_id: int


class DeleteVideoGroupUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        owned_group_loader: OwnedGroupLoader,
        group_deleter: GroupDeleter,
    ):
        self._actor_loader = actor_loader
        self._owned_group_loader = owned_group_loader
        self._group_deleter = group_deleter

    def execute(self, command: DeleteVideoGroupCommand):
        user = self._actor_loader(command.actor_id)
        group = self._owned_group_loader(user=user, group_id=command.group_id)
        if not group:
            raise LookupError("Group not found")
        self._group_deleter(group=group)


# ── Add Tags to Video ──


@dataclass(frozen=True)
class AddTagsToVideoCommand:
    actor_id: int
    video_id: int
    tag_ids: list[int]


@dataclass(frozen=True)
class AddTagsToVideoResult:
    added_count: int
    skipped_count: int


class AddTagsToVideoUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        owned_video_loader: OwnedVideoLoader,
        owned_tags_loader: OwnedTagsLoader,
        video_tags_adder: VideoTagsBulkAdder,
    ):
        self._actor_loader = actor_loader
        self._owned_video_loader = owned_video_loader
        self._owned_tags_loader = owned_tags_loader
        self._video_tags_adder = video_tags_adder

    def execute(self, command: AddTagsToVideoCommand):
        user = self._actor_loader(command.actor_id)
        video = self._owned_video_loader(user=user, video_id=command.video_id)
        if not video:
            raise LookupError("Video not found")
        if not command.tag_ids:
            raise ValueError("Tag IDs not specified")
        tags = self._owned_tags_loader(user=user, tag_ids=command.tag_ids)
        if len(tags) != len(command.tag_ids):
            raise LookupError("Some tags not found")
        result = self._video_tags_adder(video, tags, command.tag_ids)
        return AddTagsToVideoResult(
            added_count=result["added_count"],
            skipped_count=result["skipped_count"],
        )


# ── Remove Tag from Video ──


@dataclass(frozen=True)
class RemoveTagFromVideoCommand:
    actor_id: int
    video_id: int
    tag_id: int


class RemoveTagFromVideoUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        owned_video_loader: OwnedVideoLoader,
        owned_tag_loader: OwnedTagLoader,
        video_tag_remover: VideoTagRemover,
    ):
        self._actor_loader = actor_loader
        self._owned_video_loader = owned_video_loader
        self._owned_tag_loader = owned_tag_loader
        self._video_tag_remover = video_tag_remover

    def execute(self, command: RemoveTagFromVideoCommand):
        user = self._actor_loader(command.actor_id)
        video = self._owned_video_loader(user=user, video_id=command.video_id)
        if not video:
            raise LookupError("Video not found")
        tag = self._owned_tag_loader(user=user, tag_id=command.tag_id)
        if not tag:
            raise LookupError("Tag not found")
        self._video_tag_remover(video=video, tag=tag)


# ── Create Tag ──


@dataclass(frozen=True)
class CreateTagCommand:
    actor_id: int
    validated_data: dict


class CreateTagUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        tag_creator: TagCreator,
    ):
        self._actor_loader = actor_loader
        self._tag_creator = tag_creator

    def execute(self, command: CreateTagCommand):
        user = self._actor_loader(command.actor_id)
        return self._tag_creator(user=user, validated_data=command.validated_data)


# ── Update Tag ──


@dataclass(frozen=True)
class UpdateTagCommand:
    actor_id: int
    tag_id: int
    validated_data: dict


class UpdateTagUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        owned_tag_loader: OwnedTagLoader,
        tag_updater: TagUpdater,
    ):
        self._actor_loader = actor_loader
        self._owned_tag_loader = owned_tag_loader
        self._tag_updater = tag_updater

    def execute(self, command: UpdateTagCommand):
        user = self._actor_loader(command.actor_id)
        tag = self._owned_tag_loader(user=user, tag_id=command.tag_id)
        if not tag:
            raise LookupError("Tag not found")
        return self._tag_updater(tag=tag, validated_data=command.validated_data)


# ── Delete Tag ──


@dataclass(frozen=True)
class DeleteTagCommand:
    actor_id: int
    tag_id: int


class DeleteTagUseCase:
    def __init__(
        self,
        *,
        actor_loader: ActorLoader,
        owned_tag_loader: OwnedTagLoader,
        tag_deleter: TagDeleter,
    ):
        self._actor_loader = actor_loader
        self._owned_tag_loader = owned_tag_loader
        self._tag_deleter = tag_deleter

    def execute(self, command: DeleteTagCommand):
        user = self._actor_loader(command.actor_id)
        tag = self._owned_tag_loader(user=user, tag_id=command.tag_id)
        if not tag:
            raise LookupError("Tag not found")
        self._tag_deleter(tag=tag)


# ── List Videos ──


@dataclass(frozen=True)
class ListVideosQuery:
    user_id: int
    include_transcript: bool = False
    include_groups: bool = False
    q: str = ""
    status: str = ""
    tag_ids: list[int] | None = None
    ordering: str = ""


class ListVideosUseCase:
    def __init__(self, *, videos_loader: VideosQuerySetLoader):
        self._videos_loader = videos_loader

    def execute(self, query: ListVideosQuery):
        return self._videos_loader(
            user_id=query.user_id,
            include_transcript=query.include_transcript,
            include_groups=query.include_groups,
            q=query.q,
            status=query.status,
            tag_ids=query.tag_ids,
            ordering=query.ordering,
        )


# ── List Video Groups ──


@dataclass(frozen=True)
class ListVideoGroupsQuery:
    user_id: int
    include_videos: bool = True
    annotate_video_count: bool = True


class ListVideoGroupsUseCase:
    def __init__(self, *, video_groups_loader: VideoGroupsQuerySetLoader):
        self._video_groups_loader = video_groups_loader

    def execute(self, query: ListVideoGroupsQuery):
        return self._video_groups_loader(
            user_id=query.user_id,
            include_videos=query.include_videos,
            annotate_video_count=query.annotate_video_count,
        )
