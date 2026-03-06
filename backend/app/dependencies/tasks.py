"""Task entrypoint dependency providers."""

from app import composition_root


def get_run_transcription_use_case():
    return composition_root.get_run_transcription_use_case()


def get_delete_account_data_use_case():
    return composition_root.get_delete_account_data_use_case()


def get_reindex_all_videos_use_case():
    return composition_root.get_reindex_all_videos_use_case()
