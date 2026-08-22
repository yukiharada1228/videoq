from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import MagicMock

import pytest

from worker_python.tasks import reindexing
from worker_python.video_sql import VideoRow


def test_full_reindex_runs_after_acquiring_global_lock(monkeypatch) -> None:
    lock_conn = MagicMock()

    @contextmanager
    def full_lock():
        yield lock_conn

    delete = MagicMock()
    list_videos = MagicMock(return_value=[])
    monkeypatch.setattr(reindexing, "full_vector_write_lock", full_lock)
    monkeypatch.setattr(reindexing, "list_completed_videos_with_transcript", list_videos)
    monkeypatch.setattr(reindexing.vector_index, "delete_all_vectors", delete)

    result = reindexing.reindex_all_videos_embeddings()

    assert result["status"] == "completed"
    list_videos.assert_called_once_with(lock_conn)
    delete.assert_not_called()


def test_full_reindex_partial_failure_is_retried(monkeypatch) -> None:
    videos = [
        VideoRow(
            id=42,
            user_id="u1",
            title="Title",
            transcript="transcript",
            status="completed",
            source_type="uploaded",
            file_key=None,
            youtube_video_id=None,
            error_message="",
        )
    ]
    monkeypatch.setattr(reindexing.vector_index, "delete_all_vectors", MagicMock())
    monkeypatch.setattr(
        reindexing.vector_index,
        "index_video_transcript",
        MagicMock(side_effect=RuntimeError("embedding unavailable")),
    )

    with pytest.raises(reindexing.ReindexingIncompleteError, match="0/1"):
        reindexing._run_reindex(videos)
