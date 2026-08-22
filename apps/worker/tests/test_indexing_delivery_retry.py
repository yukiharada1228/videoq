from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import MagicMock

import pytest

from worker_python.tasks import indexing
from worker_python.video_sql import VideoRow


@contextmanager
def no_lock(_video_id: int):
    yield


def test_plog_delivery_failure_propagates_for_sqs_retry(monkeypatch) -> None:
    video = VideoRow(
        id=42,
        user_id="u1",
        title="Title",
        transcript="1\n00:00:00,000 --> 00:00:01,000\nhello",
        status="indexing",
        source_type="uploaded",
        file_key=None,
        youtube_video_id="",
        error_message="",
    )
    conn = MagicMock()

    @contextmanager
    def fake_connection():
        yield conn

    monkeypatch.setattr(indexing, "db_connection", fake_connection)
    monkeypatch.setattr(indexing, "video_vector_write_lock", no_lock)
    monkeypatch.setattr(indexing, "get_video_for_task", MagicMock(return_value=video))
    monkeypatch.setattr(
        indexing.vector_index,
        "index_video_transcript",
        MagicMock(return_value=1),
    )
    monkeypatch.setattr(indexing, "transition_video_status", MagicMock(return_value=True))
    monkeypatch.setattr(
        indexing,
        "enqueue_job",
        MagicMock(side_effect=RuntimeError("SQS unavailable")),
    )

    with pytest.raises(RuntimeError, match="SQS unavailable"):
        indexing.index_video_transcript(42, job_id="index-job")


def test_completed_video_retry_only_resumes_plog_handoff(monkeypatch) -> None:
    video = VideoRow(
        id=42,
        user_id="u1",
        title="Title",
        transcript="transcript",
        status="completed",
        source_type="uploaded",
        file_key=None,
        youtube_video_id="",
        error_message="",
    )
    conn = MagicMock()

    @contextmanager
    def fake_connection():
        yield conn

    monkeypatch.setattr(indexing, "db_connection", fake_connection)
    monkeypatch.setattr(indexing, "video_vector_write_lock", no_lock)
    monkeypatch.setattr(indexing, "get_video_for_task", MagicMock(return_value=video))
    index = MagicMock()
    enqueue = MagicMock(return_value="message-1")
    monkeypatch.setattr(indexing.vector_index, "index_video_transcript", index)
    monkeypatch.setattr(indexing, "enqueue_job", enqueue)

    indexing.index_video_transcript(42, job_id="index-job")

    index.assert_not_called()
    enqueue.assert_called_once()
    assert enqueue.call_args.kwargs["job_id"]
