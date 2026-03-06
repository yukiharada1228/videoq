"""Video context DI wiring.

Lifecycle policy:
- Repositories/task gateways are created per use-case resolution (request/resolve scoped).
- Stateless adapters shared across use-cases are process-scoped via cache.
"""

from functools import lru_cache

from app.domain.video.gateways import VideoTaskGateway
from app.infrastructure.external.vector_gateway import DjangoVectorStoreGateway
from app.infrastructure.repositories.django_video_repository import (
    DjangoTagRepository,
    DjangoVideoGroupRepository,
    DjangoVideoRepository,
)
from app.infrastructure.repositories.django_user_repository import DjangoUserRepository
from app.infrastructure.tasks.task_gateway import CeleryVideoTaskGateway
from app.use_cases.video.create_group_with_detail import CreateVideoGroupWithDetailUseCase
from app.use_cases.video.create_tag import CreateTagUseCase
from app.use_cases.video.create_video import CreateVideoUseCase
from app.use_cases.video.delete_group import DeleteVideoGroupUseCase
from app.use_cases.video.delete_tag import DeleteTagUseCase
from app.use_cases.video.delete_video import DeleteVideoUseCase
from app.use_cases.video.enforce_video_limit import EnforceVideoLimitUseCase
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


class TranscriptionTargetMissing(Exception):
    """Composition-root boundary error for missing transcription target."""


class TranscriptionExecutionFailed(Exception):
    """Composition-root boundary error for failed transcription execution."""


def _new_video_repository() -> DjangoVideoRepository:
    return DjangoVideoRepository()


def _new_video_group_repository() -> DjangoVideoGroupRepository:
    return DjangoVideoGroupRepository()


def _new_tag_repository() -> DjangoTagRepository:
    return DjangoTagRepository()


def _new_user_repository() -> DjangoUserRepository:
    return DjangoUserRepository()


def _new_video_task_gateway() -> CeleryVideoTaskGateway:
    return CeleryVideoTaskGateway()


def _new_vector_store_gateway() -> DjangoVectorStoreGateway:
    return DjangoVectorStoreGateway()


@lru_cache(maxsize=1)
def _get_vector_indexing_gateway():
    from app.infrastructure.external.vector_gateway import DjangoVectorIndexingGateway

    return DjangoVectorIndexingGateway()


@lru_cache(maxsize=1)
def _get_video_file_accessor():
    from app.infrastructure.transcription.video_file_accessor import DjangoVideoFileAccessor

    return DjangoVideoFileAccessor()


@lru_cache(maxsize=1)
def _get_whisper_transcription_gateway():
    from app.infrastructure.external.transcription_gateway import WhisperTranscriptionGateway

    return WhisperTranscriptionGateway(_get_video_file_accessor())


def get_list_videos_use_case() -> ListVideosUseCase:
    return ListVideosUseCase(_new_video_repository())


def get_reindex_all_videos_use_case() -> ReindexAllVideosUseCase:
    return ReindexAllVideosUseCase(
        _new_video_repository(),
        _get_vector_indexing_gateway(),
    )


def get_run_transcription_use_case() -> RunTranscriptionUseCase:
    return RunTranscriptionUseCase(
        _new_video_repository(),
        _get_whisper_transcription_gateway(),
        _get_vector_indexing_gateway(),
    )


def run_transcription(video_id: int) -> None:
    from app.use_cases.video.exceptions import (
        TranscriptionExecutionFailed as UseCaseTranscriptionExecutionFailed,
        TranscriptionTargetMissing as UseCaseTranscriptionTargetMissing,
    )

    try:
        get_run_transcription_use_case().execute(video_id)
    except UseCaseTranscriptionTargetMissing as exc:
        raise TranscriptionTargetMissing(str(exc)) from exc
    except UseCaseTranscriptionExecutionFailed as exc:
        raise TranscriptionExecutionFailed(str(exc)) from exc


def get_video_detail_use_case() -> GetVideoDetailUseCase:
    return GetVideoDetailUseCase(_new_video_repository())


def get_create_video_use_case() -> CreateVideoUseCase:
    return CreateVideoUseCase(
        _new_user_repository(),
        _new_video_repository(),
        _new_video_task_gateway(),
    )


def get_video_task_gateway() -> VideoTaskGateway:
    return _new_video_task_gateway()


def get_update_video_use_case() -> UpdateVideoUseCase:
    return UpdateVideoUseCase(
        _new_video_repository(),
        _new_vector_store_gateway(),
    )


def get_delete_video_use_case() -> DeleteVideoUseCase:
    return DeleteVideoUseCase(_new_video_repository(), _new_vector_store_gateway())


def get_enforce_video_limit_use_case() -> EnforceVideoLimitUseCase:
    return EnforceVideoLimitUseCase(_new_video_repository(), _new_vector_store_gateway())


def get_list_groups_use_case() -> ListVideoGroupsUseCase:
    return ListVideoGroupsUseCase(_new_video_group_repository())


def get_create_group_use_case() -> CreateVideoGroupWithDetailUseCase:
    return CreateVideoGroupWithDetailUseCase(_new_video_group_repository())


def get_update_group_use_case() -> UpdateVideoGroupWithDetailUseCase:
    return UpdateVideoGroupWithDetailUseCase(_new_video_group_repository())


def get_delete_group_use_case() -> DeleteVideoGroupUseCase:
    return DeleteVideoGroupUseCase(_new_video_group_repository())


def get_video_group_use_case() -> GetVideoGroupUseCase:
    return GetVideoGroupUseCase(_new_video_group_repository())


def get_shared_group_use_case() -> GetSharedGroupUseCase:
    return GetSharedGroupUseCase(_new_video_group_repository())


def get_add_video_to_group_use_case() -> AddVideoToGroupUseCase:
    return AddVideoToGroupUseCase(
        _new_video_repository(),
        _new_video_group_repository(),
    )


def get_add_videos_to_group_use_case() -> AddVideosToGroupUseCase:
    return AddVideosToGroupUseCase(_new_video_group_repository())


def get_remove_video_from_group_use_case() -> RemoveVideoFromGroupUseCase:
    return RemoveVideoFromGroupUseCase(
        _new_video_repository(),
        _new_video_group_repository(),
    )


def get_reorder_videos_use_case() -> ReorderVideosInGroupUseCase:
    return ReorderVideosInGroupUseCase(_new_video_group_repository())


def get_create_share_link_use_case() -> CreateShareLinkUseCase:
    return CreateShareLinkUseCase(_new_video_group_repository())


def get_delete_share_link_use_case() -> DeleteShareLinkUseCase:
    return DeleteShareLinkUseCase(_new_video_group_repository())


def get_list_tags_use_case() -> ListTagsUseCase:
    return ListTagsUseCase(_new_tag_repository())


def get_create_tag_use_case() -> CreateTagUseCase:
    return CreateTagUseCase(_new_tag_repository())


def get_update_tag_use_case() -> UpdateTagWithDetailUseCase:
    return UpdateTagWithDetailUseCase(_new_tag_repository())


def get_delete_tag_use_case() -> DeleteTagUseCase:
    return DeleteTagUseCase(_new_tag_repository())


def get_tag_detail_use_case() -> GetTagDetailUseCase:
    return GetTagDetailUseCase(_new_tag_repository())


def get_add_tags_to_video_use_case() -> AddTagsToVideoUseCase:
    return AddTagsToVideoUseCase(_new_video_repository(), _new_tag_repository())


def get_remove_tag_from_video_use_case() -> RemoveTagFromVideoUseCase:
    return RemoveTagFromVideoUseCase(_new_video_repository(), _new_tag_repository())
