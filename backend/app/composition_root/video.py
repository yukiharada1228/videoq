"""Video context DI wiring."""

from app.infrastructure.external.file_url_resolver import DjangoFileUrlResolver
from app.infrastructure.external.vector_gateway import DjangoVectorStoreGateway
from app.infrastructure.repositories.django_video_repository import (
    DjangoTagRepository,
    DjangoVideoGroupRepository,
    DjangoVideoRepository,
)
from app.infrastructure.tasks.task_gateway import CeleryVideoTaskGateway
from app.use_cases.video.create_group_with_detail import CreateVideoGroupWithDetailUseCase
from app.use_cases.video.create_tag import CreateTagUseCase
from app.use_cases.video.create_video import CreateVideoUseCase
from app.use_cases.video.delete_group import DeleteVideoGroupUseCase
from app.use_cases.video.delete_tag import DeleteTagUseCase
from app.use_cases.video.delete_video import DeleteVideoUseCase
from app.use_cases.video.get_group import GetSharedGroupUseCase, GetVideoGroupUseCase
from app.use_cases.video.get_tag import GetTagDetailUseCase
from app.use_cases.video.get_video import GetVideoDetailUseCase
from app.use_cases.video.list_groups import ListVideoGroupsUseCase
from app.use_cases.video.list_tags import ListTagsUseCase
from app.use_cases.video.list_videos import ListVideosUseCase
from app.use_cases.video.manage_groups import (
    AddVideoToGroupUseCase,
    AddVideosToGroupUseCase,
    CreateShareLinkUseCase,
    DeleteShareLinkUseCase,
    RemoveVideoFromGroupUseCase,
    ReorderVideosInGroupUseCase,
)
from app.use_cases.video.manage_tags import AddTagsToVideoUseCase, RemoveTagFromVideoUseCase
from app.use_cases.video.reindex_all_videos import ReindexAllVideosUseCase
from app.use_cases.video.run_transcription import RunTranscriptionUseCase
from app.use_cases.video.update_group_with_detail import UpdateVideoGroupWithDetailUseCase
from app.use_cases.video.update_tag_with_detail import UpdateTagWithDetailUseCase
from app.use_cases.video.update_video import UpdateVideoUseCase


def get_list_videos_use_case() -> ListVideosUseCase:
    return ListVideosUseCase(DjangoVideoRepository(), DjangoFileUrlResolver())


def get_reindex_all_videos_use_case() -> ReindexAllVideosUseCase:
    from app.infrastructure.external.vector_gateway import DjangoVectorIndexingGateway

    return ReindexAllVideosUseCase(DjangoVideoRepository(), DjangoVectorIndexingGateway())


def get_run_transcription_use_case() -> RunTranscriptionUseCase:
    from app.infrastructure.external.transcription_gateway import WhisperTranscriptionGateway
    from app.infrastructure.external.vector_gateway import DjangoVectorIndexingGateway
    from app.infrastructure.transcription.video_file_accessor import DjangoVideoFileAccessor

    return RunTranscriptionUseCase(
        DjangoVideoRepository(),
        WhisperTranscriptionGateway(DjangoVideoFileAccessor()),
        DjangoVectorIndexingGateway(),
    )


def get_video_detail_use_case() -> GetVideoDetailUseCase:
    return GetVideoDetailUseCase(DjangoVideoRepository(), DjangoFileUrlResolver())


def get_create_video_use_case() -> CreateVideoUseCase:
    return CreateVideoUseCase(
        DjangoVideoRepository(), CeleryVideoTaskGateway(), DjangoFileUrlResolver()
    )


def get_update_video_use_case() -> UpdateVideoUseCase:
    return UpdateVideoUseCase(
        DjangoVideoRepository(), DjangoVectorStoreGateway(), DjangoFileUrlResolver()
    )


def get_delete_video_use_case() -> DeleteVideoUseCase:
    return DeleteVideoUseCase(DjangoVideoRepository())


def get_list_groups_use_case() -> ListVideoGroupsUseCase:
    return ListVideoGroupsUseCase(DjangoVideoGroupRepository())


def get_create_group_use_case() -> CreateVideoGroupWithDetailUseCase:
    return CreateVideoGroupWithDetailUseCase(
        DjangoVideoGroupRepository(), DjangoFileUrlResolver()
    )


def get_update_group_use_case() -> UpdateVideoGroupWithDetailUseCase:
    return UpdateVideoGroupWithDetailUseCase(
        DjangoVideoGroupRepository(), DjangoFileUrlResolver()
    )


def get_delete_group_use_case() -> DeleteVideoGroupUseCase:
    return DeleteVideoGroupUseCase(DjangoVideoGroupRepository())


def get_video_group_use_case() -> GetVideoGroupUseCase:
    return GetVideoGroupUseCase(DjangoVideoGroupRepository(), DjangoFileUrlResolver())


def get_shared_group_use_case() -> GetSharedGroupUseCase:
    return GetSharedGroupUseCase(DjangoVideoGroupRepository(), DjangoFileUrlResolver())


def get_add_video_to_group_use_case() -> AddVideoToGroupUseCase:
    return AddVideoToGroupUseCase(DjangoVideoRepository(), DjangoVideoGroupRepository())


def get_add_videos_to_group_use_case() -> AddVideosToGroupUseCase:
    return AddVideosToGroupUseCase(DjangoVideoGroupRepository())


def get_remove_video_from_group_use_case() -> RemoveVideoFromGroupUseCase:
    return RemoveVideoFromGroupUseCase(DjangoVideoRepository(), DjangoVideoGroupRepository())


def get_reorder_videos_use_case() -> ReorderVideosInGroupUseCase:
    return ReorderVideosInGroupUseCase(DjangoVideoGroupRepository())


def get_create_share_link_use_case() -> CreateShareLinkUseCase:
    return CreateShareLinkUseCase(DjangoVideoGroupRepository())


def get_delete_share_link_use_case() -> DeleteShareLinkUseCase:
    return DeleteShareLinkUseCase(DjangoVideoGroupRepository())


def get_list_tags_use_case() -> ListTagsUseCase:
    return ListTagsUseCase(DjangoTagRepository())


def get_create_tag_use_case() -> CreateTagUseCase:
    return CreateTagUseCase(DjangoTagRepository())


def get_update_tag_use_case() -> UpdateTagWithDetailUseCase:
    return UpdateTagWithDetailUseCase(DjangoTagRepository(), DjangoFileUrlResolver())


def get_delete_tag_use_case() -> DeleteTagUseCase:
    return DeleteTagUseCase(DjangoTagRepository())


def get_tag_detail_use_case() -> GetTagDetailUseCase:
    return GetTagDetailUseCase(DjangoTagRepository(), DjangoFileUrlResolver())


def get_add_tags_to_video_use_case() -> AddTagsToVideoUseCase:
    return AddTagsToVideoUseCase(DjangoVideoRepository(), DjangoTagRepository())


def get_remove_tag_from_video_use_case() -> RemoveTagFromVideoUseCase:
    return RemoveTagFromVideoUseCase(DjangoVideoRepository(), DjangoTagRepository())
