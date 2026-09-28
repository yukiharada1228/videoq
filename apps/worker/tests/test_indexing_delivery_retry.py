from __future__ import annotations

from contextlib import contextmanager, nullcontext
from unittest.mock import MagicMock

import pytest

from worker_python.tasks import indexing
from worker_python import sqs_enqueue
from worker_python.video_sql import VideoRow


@contextmanager
def no_lock(_video_id: int):
    yield


@pytest.mark.parametrize("transcript", [None, "", "invalid SRT"])
def test_existing_video_with_invalid_transcript_still_fails_without_provider_work(monkeypatch, transcript):
    video = VideoRow(
        id=42, user_id="u1", title="Title", transcript=transcript,
        status="indexing", source_type="uploaded", file_key=None, youtube_video_id=None,
    )
    conn = MagicMock()
    monkeypatch.setattr(indexing, "db_connection", lambda: nullcontext(conn))
    monkeypatch.setattr(indexing, "video_vector_write_lock", no_lock)
    monkeypatch.setattr(indexing, "get_video_for_task", lambda *_args: video)
    embed = MagicMock()
    transition = MagicMock()
    monkeypatch.setattr(indexing.vector_index, "embed_texts", embed)
    monkeypatch.setattr(indexing, "transition_video_status", transition)

    with pytest.raises(indexing.IndexingExecutionFailedError, match="no transcript|no valid SRT scenes"):
        indexing.index_video_transcript(42)

    embed.assert_not_called()
    transition.assert_not_called()


def test_indexing_completes_without_scheduling_another_job(monkeypatch) -> None:
    video = VideoRow(
        id=42,
        user_id="u1",
        title="Title",
        transcript="1\n00:00:00,000 --> 00:00:01,000\nhello",
        status="indexing",
        source_type="uploaded",
        file_key=None,
        youtube_video_id="",
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
        sqs_enqueue,
        "enqueue_job",
        MagicMock(side_effect=RuntimeError("SQS unavailable")),
    )

    indexing.index_video_transcript(42)

    indexing.vector_index.index_video_transcript.assert_called_once_with(video)
    indexing.transition_video_status.assert_called_once_with(conn, 42, "indexing", "completed")
    sqs_enqueue.enqueue_job.assert_not_called()


@pytest.mark.parametrize("transcript", ["transcript", "", None])
def test_completed_video_retry_does_not_reindex_or_schedule_jobs(monkeypatch, transcript) -> None:
    video = VideoRow(
        id=42,
        user_id="u1",
        title="Title",
        transcript=transcript,
        status="completed",
        source_type="uploaded",
        file_key=None,
        youtube_video_id="",
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
    monkeypatch.setattr(sqs_enqueue, "enqueue_job", enqueue)

    indexing.index_video_transcript(42)

    index.assert_not_called()
    enqueue.assert_not_called()
