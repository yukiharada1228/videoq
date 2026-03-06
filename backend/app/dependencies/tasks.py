"""Task entrypoint dependency providers."""

from app.composition_root import auth as _cr_auth
from app.composition_root import video as _cr_video


def get_run_transcription_use_case():
    return _cr_video.get_run_transcription_use_case()


def get_transcription_target_missing_exception():
    return _cr_video.get_transcription_target_missing_exception()


def get_transcription_execution_failed_exception():
    return _cr_video.get_transcription_execution_failed_exception()


def get_delete_account_data_use_case():
    return _cr_auth.get_delete_account_data_use_case()


def get_reindex_all_videos_use_case():
    return _cr_video.get_reindex_all_videos_use_case()
