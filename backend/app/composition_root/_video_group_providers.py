"""Video group/share use-case providers."""

from app.use_cases.video.create_group_with_detail import CreateVideoGroupWithDetailUseCase
from app.use_cases.video.delete_group import DeleteVideoGroupUseCase
from app.use_cases.video.get_group import GetSharedGroupUseCase, GetVideoGroupUseCase
from app.use_cases.video.list_groups import ListVideoGroupsUseCase
from app.use_cases.video.manage_groups import (
    AddVideoToGroupUseCase,
    AddVideosToGroupUseCase,
    CreateShareLinkUseCase,
    DeleteShareLinkUseCase,
    RemoveVideoFromGroupUseCase,
    ReorderVideosInGroupUseCase,
)
from app.use_cases.video.update_group_with_detail import UpdateVideoGroupWithDetailUseCase

from . import _video_shared as shared


def get_list_groups_use_case() -> ListVideoGroupsUseCase:
    return ListVideoGroupsUseCase(shared.new_video_group_repository())


def get_create_group_use_case() -> CreateVideoGroupWithDetailUseCase:
    return CreateVideoGroupWithDetailUseCase(shared.new_video_group_repository())


def get_update_group_use_case() -> UpdateVideoGroupWithDetailUseCase:
    return UpdateVideoGroupWithDetailUseCase(shared.new_video_group_repository())


def get_delete_group_use_case() -> DeleteVideoGroupUseCase:
    return DeleteVideoGroupUseCase(shared.new_video_group_repository())


def get_video_group_use_case() -> GetVideoGroupUseCase:
    return GetVideoGroupUseCase(shared.new_video_group_repository())


def get_shared_group_use_case() -> GetSharedGroupUseCase:
    return GetSharedGroupUseCase(shared.new_video_group_repository())


def get_add_video_to_group_use_case() -> AddVideoToGroupUseCase:
    return AddVideoToGroupUseCase(
        shared.new_video_repository(),
        shared.new_video_group_repository(),
    )


def get_add_videos_to_group_use_case() -> AddVideosToGroupUseCase:
    return AddVideosToGroupUseCase(
        shared.new_video_repository(),
        shared.new_video_group_repository(),
    )


def get_remove_video_from_group_use_case() -> RemoveVideoFromGroupUseCase:
    return RemoveVideoFromGroupUseCase(
        shared.new_video_repository(),
        shared.new_video_group_repository(),
    )


def get_reorder_videos_use_case() -> ReorderVideosInGroupUseCase:
    return ReorderVideosInGroupUseCase(shared.new_video_group_repository())


def get_create_share_link_use_case() -> CreateShareLinkUseCase:
    return CreateShareLinkUseCase(shared.new_video_group_repository())


def get_delete_share_link_use_case() -> DeleteShareLinkUseCase:
    return DeleteShareLinkUseCase(shared.new_video_group_repository())
