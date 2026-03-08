"""Task entrypoint dependency providers."""

from app.composition_root import auth as _cr_auth
from app.composition_root import video as _cr_video


class TranscriptionTargetMissingError(Exception):
    """Raised when the transcription target video does not exist."""


class TranscriptionExecutionFailedError(Exception):
    """Raised when transcription execution fails and retry is allowed."""


class IndexingTargetMissingError(Exception):
    """Raised when the indexing target video does not exist or has no transcript."""


class IndexingExecutionFailedError(Exception):
    """Raised when vector indexing fails and retry is allowed."""


def get_run_transcription_use_case():
    return _cr_video.get_run_transcription_use_case()


def run_transcription(video_id: int) -> None:
    try:
        _cr_video.run_transcription(video_id)
    except _cr_video.TranscriptionTargetMissing as exc:
        raise TranscriptionTargetMissingError(str(exc)) from exc
    except _cr_video.TranscriptionExecutionFailed as exc:
        raise TranscriptionExecutionFailedError(str(exc)) from exc


def index_video_transcript(video_id: int) -> None:
    try:
        _cr_video.index_video_transcript(video_id)
    except _cr_video.IndexingTargetMissing as exc:
        raise IndexingTargetMissingError(str(exc)) from exc
    except _cr_video.IndexingExecutionFailed as exc:
        raise IndexingExecutionFailedError(str(exc)) from exc


def mark_indexing_failed(video_id: int, reason: str = "") -> None:
    _cr_video.mark_indexing_failed(video_id, reason)


def get_delete_account_data_use_case():
    return _cr_auth.get_delete_account_data_use_case()


def get_reindex_all_videos_use_case():
    return _cr_video.get_reindex_all_videos_use_case()
