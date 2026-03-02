from dataclasses import dataclass

from app.video.ports import (GroupMemberAdder, GroupMembersAdder,
                             GroupReorderer, ShareTokenUpdater, VideoCreator,
                             VideoTagsAdder)


@dataclass(frozen=True)
class UploadVideoCommand:
    validated_data: dict


class UploadVideoUseCase:
    def __init__(self, *, video_creator: VideoCreator):
        self._video_creator = video_creator

    def execute(self, command: UploadVideoCommand):
        return self._video_creator(command)


@dataclass(frozen=True)
class AddVideoToGroupCommand:
    group_id: int
    video_id: int


@dataclass(frozen=True)
class AddVideoToGroupResult:
    member_id: int


class AddVideoToGroupUseCase:
    def __init__(self, *, group_member_adder: GroupMemberAdder):
        self._group_member_adder = group_member_adder

    def execute(self, command: AddVideoToGroupCommand):
        member = self._group_member_adder(command)
        if member is None:
            raise ValueError("This video is already added to the group")
        return AddVideoToGroupResult(member_id=member.id)


@dataclass(frozen=True)
class AddVideosToGroupCommand:
    group_id: int
    video_ids: list[int]


@dataclass(frozen=True)
class AddVideosToGroupResult:
    added_count: int
    skipped_count: int


class AddVideosToGroupUseCase:
    def __init__(self, *, group_members_adder: GroupMembersAdder):
        self._group_members_adder = group_members_adder

    def execute(self, command: AddVideosToGroupCommand):
        result = self._group_members_adder(command)
        return AddVideosToGroupResult(
            added_count=result["added_count"],
            skipped_count=result["skipped_count"],
        )


@dataclass(frozen=True)
class ReorderVideosInGroupCommand:
    group_id: int
    video_ids: list[int]


class ReorderVideosInGroupUseCase:
    def __init__(self, *, group_reorderer: GroupReorderer):
        self._group_reorderer = group_reorderer

    def execute(self, command: ReorderVideosInGroupCommand):
        self._group_reorderer(command)


@dataclass(frozen=True)
class CreateShareLinkCommand:
    group_id: int


@dataclass(frozen=True)
class CreateShareLinkResult:
    share_token: str


class CreateShareLinkUseCase:
    def __init__(self, *, share_token_updater: ShareTokenUpdater):
        self._share_token_updater = share_token_updater

    def execute(self, command: CreateShareLinkCommand):
        share_token = self._share_token_updater(command)
        return CreateShareLinkResult(share_token=share_token)


@dataclass(frozen=True)
class DeleteShareLinkCommand:
    group_id: int


class DeleteShareLinkUseCase:
    def __init__(self, *, share_token_updater: ShareTokenUpdater):
        self._share_token_updater = share_token_updater

    def execute(self, command: DeleteShareLinkCommand):
        self._share_token_updater(command)


@dataclass(frozen=True)
class AddTagsToVideoCommand:
    video_id: int
    tag_ids: list[int]


@dataclass(frozen=True)
class AddTagsToVideoResult:
    added_count: int
    skipped_count: int


class AddTagsToVideoUseCase:
    def __init__(self, *, video_tags_adder: VideoTagsAdder):
        self._video_tags_adder = video_tags_adder

    def execute(self, command: AddTagsToVideoCommand):
        result = self._video_tags_adder(command)
        return AddTagsToVideoResult(
            added_count=result["added_count"],
            skipped_count=result["skipped_count"],
        )
