"""Video core use-case providers."""

from app.infrastructure.repositories.django_openai_key_repository import (
    DjangoOpenAiApiKeyRepository,
)
from app.infrastructure.common.django_transaction import DjangoTransactionPort
from app.use_cases.video.confirm_video_upload import ConfirmVideoUploadUseCase
from app.use_cases.video.create_video import CreateVideoUseCase
from app.use_cases.video.delete_video import DeleteVideoUseCase
from app.use_cases.video.enforce_video_limit import EnforceVideoLimitUseCase
from app.use_cases.video.get_video import GetVideoDetailUseCase
from app.use_cases.video.index_video import IndexVideoTranscriptUseCase
from app.use_cases.video.list_videos import ListVideosUseCase
from app.use_cases.video.reindex_all_videos import ReindexAllVideosUseCase
from app.use_cases.video.request_video_upload import RequestVideoUploadUseCase
from app.use_cases.video.run_transcription import RunTranscriptionUseCase
from app.use_cases.video.update_video import UpdateVideoUseCase

from . import _video_shared as shared


def get_list_videos_use_case() -> ListVideosUseCase:
    return ListVideosUseCase(shared.new_video_repository())


def get_reindex_all_videos_use_case() -> ReindexAllVideosUseCase:
    return ReindexAllVideosUseCase(
        shared.new_video_repository(),
        shared.get_vector_indexing_gateway(),
        api_key_repo=DjangoOpenAiApiKeyRepository(),
    )


def get_run_transcription_use_case() -> RunTranscriptionUseCase:
    return RunTranscriptionUseCase(
        shared.new_video_repository(),
        shared.get_whisper_transcription_gateway(),
        shared.new_video_task_gateway(),
        DjangoTransactionPort(),
        api_key_repo=DjangoOpenAiApiKeyRepository(),
    )


def get_index_video_use_case() -> IndexVideoTranscriptUseCase:
    return IndexVideoTranscriptUseCase(
        shared.new_video_repository(),
        shared.get_vector_indexing_gateway(),
        api_key_repo=DjangoOpenAiApiKeyRepository(),
    )


def get_video_detail_use_case() -> GetVideoDetailUseCase:
    return GetVideoDetailUseCase(shared.new_video_repository())


def get_create_video_use_case() -> CreateVideoUseCase:
    return CreateVideoUseCase(
        shared.new_user_repository(),
        shared.new_video_repository(),
        shared.new_video_task_gateway(),
        DjangoTransactionPort(),
    )


def get_update_video_use_case() -> UpdateVideoUseCase:
    return UpdateVideoUseCase(
        shared.new_video_repository(),
        shared.new_vector_store_gateway(),
        DjangoTransactionPort(),
    )


def get_delete_video_use_case() -> DeleteVideoUseCase:
    return DeleteVideoUseCase(
        shared.new_video_repository(),
        shared.new_vector_store_gateway(),
        DjangoTransactionPort(),
    )


def get_enforce_video_limit_use_case() -> EnforceVideoLimitUseCase:
    return EnforceVideoLimitUseCase(
        shared.new_video_repository(),
        shared.new_vector_store_gateway(),
        DjangoTransactionPort(),
    )


def get_request_video_upload_use_case() -> RequestVideoUploadUseCase:
    return RequestVideoUploadUseCase(
        shared.new_user_repository(),
        shared.new_video_repository(),
        shared.get_file_upload_gateway(),
        DjangoTransactionPort(),
    )


def get_confirm_video_upload_use_case() -> ConfirmVideoUploadUseCase:
    return ConfirmVideoUploadUseCase(
        shared.new_video_repository(),
        shared.new_video_task_gateway(),
        DjangoTransactionPort(),
    )
