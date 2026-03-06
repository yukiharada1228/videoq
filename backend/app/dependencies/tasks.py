"""Task entrypoint dependency providers."""

from app import factories


def get_run_transcription_use_case():
    return factories.get_run_transcription_use_case()


def get_delete_account_data_use_case():
    return factories.get_delete_account_data_use_case()


def get_reindex_all_videos_use_case():
    return factories.get_reindex_all_videos_use_case()
