"""Task entrypoint dependency providers."""

from app import factories


def get_run_transcription_use_case():
    return factories.get_run_transcription_use_case()
