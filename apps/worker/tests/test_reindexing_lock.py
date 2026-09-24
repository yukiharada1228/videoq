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
    @contextmanager
    def stream_videos(conn):
        assert conn is lock_conn
        yield iter(())

    stream = MagicMock(side_effect=stream_videos)
    monkeypatch.setattr(reindexing, "full_vector_write_lock", full_lock)
    monkeypatch.setattr(reindexing, "stream_completed_videos_with_transcript", stream)
    monkeypatch.setattr(reindexing.vector_index, "delete_all_vectors", delete)

    result = reindexing.reindex_all_videos_embeddings()

    assert result["status"] == "completed"
    stream.assert_called_once_with(lock_conn)
    delete.assert_not_called()


def test_full_reindex_partial_failure_is_retried(monkeypatch) -> None:
    monkeypatch.setattr(reindexing.vector_index, "check_embedding_storage", MagicMock())
    monkeypatch.setattr(reindexing, "embed_texts", MagicMock())
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


def test_full_reindex_consumes_videos_lazily_and_does_not_delete_each_video(monkeypatch) -> None:
    events = []
    monkeypatch.setattr(reindexing.vector_index, "check_embedding_storage", lambda: events.append("schema"))
    monkeypatch.setattr(reindexing, "embed_texts", lambda _: events.append("preflight"))
    monkeypatch.setattr(reindexing.vector_index, "delete_all_vectors", lambda: events.append("delete_all") or 7)

    def videos():
        for video_id in range(1, 4):
            events.append(("read", video_id))
            yield VideoRow(
                id=video_id, user_id="owner", title="Video", transcript="subtitle",
                status="completed", source_type="uploaded", file_key=None,
                youtube_video_id=None,
            )

    def index(video, *, replace_existing=True):
        assert not replace_existing
        events.append(("index", video.id))
        if video.id == 2:
            raise RuntimeError("provider unavailable")

    monkeypatch.setattr(reindexing.vector_index, "index_video_transcript", index)
    with pytest.raises(reindexing.ReindexingIncompleteError, match="2/3 videos; 1 video"):
        reindexing._run_reindex(videos())

    assert events == [
        ("read", 1), "schema", "preflight", "delete_all", ("index", 1),
        ("read", 2), ("index", 2), ("read", 3), ("index", 3),
    ]


@pytest.mark.parametrize("size", [0, 3])
def test_full_reindex_reports_totals_for_an_iterator(monkeypatch, size) -> None:
    check = MagicMock()
    embed = MagicMock()
    delete = MagicMock()
    index = MagicMock()
    monkeypatch.setattr(reindexing.vector_index, "check_embedding_storage", check)
    monkeypatch.setattr(reindexing, "embed_texts", embed)
    monkeypatch.setattr(reindexing.vector_index, "delete_all_vectors", delete)
    monkeypatch.setattr(reindexing.vector_index, "index_video_transcript", index)
    videos = (
        VideoRow(
            id=i, user_id="owner", title="Video", transcript="subtitle",
            status="completed", source_type="uploaded", file_key=None,
            youtube_video_id=None,
        ) for i in range(size)
    )
    result = reindexing._run_reindex(videos)
    assert result["status"] == "completed"
    assert result["total_videos"] == result["successful_count"] == size
    assert result["failed_count"] == 0
    assert index.call_count == size
    assert check.call_count == embed.call_count == delete.call_count == bool(size)
