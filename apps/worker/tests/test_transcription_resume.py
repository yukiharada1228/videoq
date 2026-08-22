from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import MagicMock

from worker_python.tasks import transcription
from worker_python.video_sql import VideoRow


def _video(status: str) -> VideoRow:
    return VideoRow(
        id=42,
        user_id="u1",
        title="Title",
        transcript="transcript",
        status=status,
        source_type="uploaded",
        file_key="videos/u1/42.mp4",
        youtube_video_id="",
        error_message="",
    )


def test_indexing_status_retry_resumes_only_index_handoff(monkeypatch) -> None:
    conn = MagicMock()

    @contextmanager
    def fake_connection():
        yield conn

    enqueue = MagicMock(return_value="message-1")
    run = MagicMock()
    monkeypatch.setattr(transcription, "db_connection", fake_connection)
    monkeypatch.setattr(
        transcription, "get_video_for_task", MagicMock(return_value=_video("indexing"))
    )
    monkeypatch.setattr(transcription, "enqueue_job", enqueue)
    monkeypatch.setattr(transcription, "run_transcription", run)

    transcription.transcribe_video(42, job_id="transcribe-job")

    run.assert_not_called()
    enqueue.assert_called_once()
    assert enqueue.call_args.kwargs["job_id"]


def test_completed_status_duplicate_is_a_noop(monkeypatch) -> None:
    conn = MagicMock()

    @contextmanager
    def fake_connection():
        yield conn

    monkeypatch.setattr(transcription, "db_connection", fake_connection)
    monkeypatch.setattr(
        transcription, "get_video_for_task", MagicMock(return_value=_video("completed"))
    )
    run = MagicMock()
    enqueue = MagicMock()
    monkeypatch.setattr(transcription, "run_transcription", run)
    monkeypatch.setattr(transcription, "enqueue_job", enqueue)

    transcription.transcribe_video(42, job_id="transcribe-job")

    run.assert_not_called()
    enqueue.assert_not_called()
