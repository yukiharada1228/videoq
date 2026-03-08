"""Video tag use-case providers."""

from app.use_cases.video.create_tag import CreateTagUseCase
from app.use_cases.video.delete_tag import DeleteTagUseCase
from app.use_cases.video.get_tag import GetTagDetailUseCase
from app.use_cases.video.list_tags import ListTagsUseCase
from app.use_cases.video.manage_tags import AddTagsToVideoUseCase, RemoveTagFromVideoUseCase
from app.use_cases.video.update_tag_with_detail import UpdateTagWithDetailUseCase

from . import _video_shared as shared


def get_list_tags_use_case() -> ListTagsUseCase:
    return ListTagsUseCase(shared.new_tag_repository())


def get_create_tag_use_case() -> CreateTagUseCase:
    return CreateTagUseCase(shared.new_tag_repository())


def get_update_tag_use_case() -> UpdateTagWithDetailUseCase:
    return UpdateTagWithDetailUseCase(shared.new_tag_repository())


def get_delete_tag_use_case() -> DeleteTagUseCase:
    return DeleteTagUseCase(shared.new_tag_repository())


def get_tag_detail_use_case() -> GetTagDetailUseCase:
    return GetTagDetailUseCase(shared.new_tag_repository())


def get_add_tags_to_video_use_case() -> AddTagsToVideoUseCase:
    return AddTagsToVideoUseCase(
        shared.new_video_repository(),
        shared.new_tag_repository(),
    )


def get_remove_tag_from_video_use_case() -> RemoveTagFromVideoUseCase:
    return RemoveTagFromVideoUseCase(
        shared.new_video_repository(),
        shared.new_tag_repository(),
    )
