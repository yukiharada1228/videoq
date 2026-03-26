"""Video core use-case providers."""
from app.infrastructure.common.django_transaction import DjangoTransactionPort
from app.use_cases.video.confirm_video_upload import ConfirmVideoUploadUseCase
from app.use_cases.video.create_video import CreateVideoUseCase
from app.use_cases.video.delete_video import DeleteVideoUseCase
from app.use_cases.video.get_video import GetVideoDetailUseCase
from app.use_cases.video.index_video import IndexVideoTranscriptUseCase
from app.use_cases.video.list_videos import ListVideosUseCase
from app.use_cases.video.reindex_all_videos import ReindexAllVideosUseCase
from app.use_cases.video.request_video_upload import RequestVideoUploadUseCase
from app.use_cases.video.run_transcription import RunTranscriptionUseCase
from app.use_cases.video.update_video import UpdateVideoUseCase

from . import _video_shared as shared
from app.composition_root import billing as _billing_cr


def get_list_videos_use_case() -> ListVideosUseCase:
    return ListVideosUseCase(shared.new_video_repository())


def get_reindex_all_videos_use_case() -> ReindexAllVideosUseCase:
    return ReindexAllVideosUseCase(
        shared.new_video_repository(),
        shared.get_vector_indexing_gateway(),
    )


def _make_duration_estimator():
    import math
    from app.infrastructure.common.task_helpers import TemporaryFileManager
    from app.infrastructure.transcription.audio_processing import _get_video_duration

    video_file_accessor = shared.get_video_file_accessor()

    def estimator(video_id: int):
        try:
            with TemporaryFileManager() as temp_manager:
                path = video_file_accessor.get_local_path(video_id, temp_manager)
                duration_seconds = _get_video_duration(path)
            return max(1, math.ceil(duration_seconds))
        except Exception:
            return None

    return estimator


def get_run_transcription_use_case() -> RunTranscriptionUseCase:
    return RunTranscriptionUseCase(
        shared.new_video_repository(),
        shared.get_whisper_transcription_gateway(),
        shared.new_video_task_gateway(),
        shared.get_file_upload_gateway(),
        DjangoTransactionPort(),
        user_repo=shared.new_user_repository(),
        duration_estimator=_make_duration_estimator(),
        processing_limit_check_use_case=_billing_cr.get_check_processing_limit_use_case(),
        processing_record_use_case=_billing_cr.get_record_processing_usage_use_case(),
    )


def get_index_video_use_case() -> IndexVideoTranscriptUseCase:
    return IndexVideoTranscriptUseCase(
        shared.new_video_repository(),
        shared.get_vector_indexing_gateway(),
    )


def get_video_detail_use_case() -> GetVideoDetailUseCase:
    return GetVideoDetailUseCase(shared.new_video_repository())


def get_create_video_use_case() -> CreateVideoUseCase:
    return CreateVideoUseCase(
        shared.new_user_repository(),
        shared.new_video_repository(),
        shared.new_video_task_gateway(),
        DjangoTransactionPort(),
        storage_limit_check_use_case=_billing_cr.get_check_storage_limit_use_case(),
        storage_record_use_case=_billing_cr.get_record_storage_usage_use_case(),
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
        upload_gateway=shared.get_file_upload_gateway(),
        storage_record_use_case=_billing_cr.get_record_storage_usage_use_case(),
    )

def get_request_video_upload_use_case() -> RequestVideoUploadUseCase:
    return RequestVideoUploadUseCase(
        shared.new_user_repository(),
        shared.new_video_repository(),
        shared.get_file_upload_gateway(),
        DjangoTransactionPort(),
        storage_limit_check_use_case=_billing_cr.get_check_storage_limit_use_case(),
    )


def get_confirm_video_upload_use_case() -> ConfirmVideoUploadUseCase:
    return ConfirmVideoUploadUseCase(
        shared.new_video_repository(),
        shared.new_video_task_gateway(),
        DjangoTransactionPort(),
    )
