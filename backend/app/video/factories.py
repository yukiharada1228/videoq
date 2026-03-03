from django.contrib.auth import get_user_model

from app.common.actors import DjangoActorLoader
from app.video import repositories
from app.video.services import (VideoGroupMemberService,
                                VideoTagService, VideoUploadService)
from app.video.use_cases import (AddTagsToVideoUseCase,
                                 AddVideosToGroupUseCase,
                                 AddVideoToGroupUseCase,
                                 CreateShareLinkUseCase, CreateTagUseCase,
                                 CreateVideoGroupUseCase,
                                 DeleteShareLinkUseCase, DeleteTagUseCase,
                                 DeleteVideoGroupUseCase, DeleteVideoUseCase,
                                 GetSharedGroupUseCase, ListVideoGroupsUseCase,
                                 ListVideosUseCase, RemoveTagFromVideoUseCase,
                                 RemoveVideoFromGroupUseCase,
                                 ReorderVideosInGroupUseCase, UpdateTagUseCase,
                                 UpdateVideoGroupUseCase, UpdateVideoUseCase,
                                 UploadVideoUseCase)

User = get_user_model()
_actor_loader = DjangoActorLoader(User)


def _video_title_vector_updater(video_id: int, new_title: str):
    from app.utils.vector_manager import update_video_title_in_vectors

    update_video_title_in_vectors(video_id, new_title)


def _video_deleter(*, video):
    from django.db import transaction

    file_ref = video.file
    video.delete()
    if file_ref:
        transaction.on_commit(lambda: file_ref.delete(save=False))


def upload_video_use_case() -> UploadVideoUseCase:
    return UploadVideoUseCase(
        actor_loader=_actor_loader,
        upload_limit_checker=VideoUploadService.validate_upload_allowed,
        video_creator=VideoUploadService.create_video,
    )


def update_video_use_case() -> UpdateVideoUseCase:
    return UpdateVideoUseCase(
        actor_loader=_actor_loader,
        owned_video_loader=repositories.get_owned_video,
        video_updater=repositories.update_video,
        video_title_vector_updater=_video_title_vector_updater,
    )


def delete_video_use_case() -> DeleteVideoUseCase:
    return DeleteVideoUseCase(
        actor_loader=_actor_loader,
        owned_video_loader=repositories.get_owned_video,
        video_deleter=_video_deleter,
    )


def add_video_to_group_use_case() -> AddVideoToGroupUseCase:
    return AddVideoToGroupUseCase(
        actor_loader=_actor_loader,
        owned_group_loader=repositories.get_owned_group,
        owned_video_loader=repositories.get_owned_video,
        group_member_adder=VideoGroupMemberService.add_video_to_group,
    )


def add_videos_to_group_use_case() -> AddVideosToGroupUseCase:
    return AddVideosToGroupUseCase(
        actor_loader=_actor_loader,
        owned_group_loader=repositories.get_owned_group,
        owned_videos_loader=repositories.get_owned_videos,
        group_members_adder=VideoGroupMemberService.add_videos_to_group,
    )


def reorder_videos_in_group_use_case() -> ReorderVideosInGroupUseCase:
    return ReorderVideosInGroupUseCase(
        actor_loader=_actor_loader,
        owned_group_loader=repositories.get_owned_group,
        group_reorderer=VideoGroupMemberService.reorder_videos,
    )


def remove_video_from_group_use_case() -> RemoveVideoFromGroupUseCase:
    return RemoveVideoFromGroupUseCase(
        actor_loader=_actor_loader,
        owned_group_loader=repositories.get_owned_group,
        owned_video_loader=repositories.get_owned_video,
        group_member_remover=repositories.remove_member,
    )


def create_share_link_use_case() -> CreateShareLinkUseCase:
    return CreateShareLinkUseCase(
        actor_loader=_actor_loader,
        owned_group_loader=repositories.get_owned_group,
        share_token_saver=repositories.save_group_share_token,
    )


def delete_share_link_use_case() -> DeleteShareLinkUseCase:
    return DeleteShareLinkUseCase(
        actor_loader=_actor_loader,
        owned_group_loader=repositories.get_owned_group,
        share_token_saver=repositories.save_group_share_token,
    )


def get_shared_group_use_case() -> GetSharedGroupUseCase:
    return GetSharedGroupUseCase(
        shared_group_loader=repositories.get_shared_group,
    )


def create_video_group_use_case() -> CreateVideoGroupUseCase:
    return CreateVideoGroupUseCase(
        actor_loader=_actor_loader,
        group_creator=repositories.create_group,
    )


def update_video_group_use_case() -> UpdateVideoGroupUseCase:
    return UpdateVideoGroupUseCase(
        actor_loader=_actor_loader,
        owned_group_loader=repositories.get_owned_group,
        group_updater=repositories.update_group,
    )


def delete_video_group_use_case() -> DeleteVideoGroupUseCase:
    return DeleteVideoGroupUseCase(
        actor_loader=_actor_loader,
        owned_group_loader=repositories.get_owned_group,
        group_deleter=repositories.delete_group,
    )


def add_tags_to_video_use_case() -> AddTagsToVideoUseCase:
    return AddTagsToVideoUseCase(
        actor_loader=_actor_loader,
        owned_video_loader=repositories.get_owned_video,
        owned_tags_loader=repositories.get_owned_tags,
        video_tags_adder=VideoTagService.add_tags_to_video,
    )


def remove_tag_from_video_use_case() -> RemoveTagFromVideoUseCase:
    return RemoveTagFromVideoUseCase(
        actor_loader=_actor_loader,
        owned_video_loader=repositories.get_owned_video,
        owned_tag_loader=repositories.get_owned_tag,
        video_tag_remover=repositories.remove_video_tag,
    )


def create_tag_use_case() -> CreateTagUseCase:
    return CreateTagUseCase(
        actor_loader=_actor_loader,
        tag_creator=repositories.create_tag,
    )


def update_tag_use_case() -> UpdateTagUseCase:
    return UpdateTagUseCase(
        actor_loader=_actor_loader,
        owned_tag_loader=repositories.get_owned_tag,
        tag_updater=repositories.update_tag,
    )


def delete_tag_use_case() -> DeleteTagUseCase:
    return DeleteTagUseCase(
        actor_loader=_actor_loader,
        owned_tag_loader=repositories.get_owned_tag,
        tag_deleter=repositories.delete_tag,
    )


def list_videos_use_case() -> ListVideosUseCase:
    return ListVideosUseCase(
        videos_loader=repositories.get_filtered_videos,
    )


def list_video_groups_use_case() -> ListVideoGroupsUseCase:
    return ListVideoGroupsUseCase(
        video_groups_loader=repositories.get_video_groups_for_user,
    )
