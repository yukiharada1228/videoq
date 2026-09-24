from __future__ import annotations

import os
import uuid
from contextlib import contextmanager
from unittest.mock import MagicMock

import psycopg
import pytest
from psycopg.rows import dict_row

from worker_python.tasks import reindexing
from worker_python.video_sql import stream_completed_videos_with_transcript


@pytest.mark.parametrize("failure", ["none", "schema", "embedding", "read"])
def test_stream_is_lazy_and_closes_before_releasing_the_lock(monkeypatch, failure):
    events = []
    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value

    def rows():
        for video_id in range(1, 4):
            if failure == "read" and video_id == 2:
                raise RuntimeError("read failed")
            events.append(("read", video_id))
            yield {
                "id": video_id, "user_id": "owner", "title": "Video",
                "status": "completed", "transcript": "subtitle",
            }

    cursor.__iter__.side_effect = rows
    conn.cursor.return_value.__exit__.side_effect = lambda *_: events.append("close_cursor")

    @contextmanager
    def lock():
        events.append("lock")
        try:
            yield conn
        finally:
            events.append("unlock")

    def preflight(stage):
        if failure == stage:
            raise RuntimeError(f"{stage} failed")

    monkeypatch.setattr(reindexing, "full_vector_write_lock", lock)
    monkeypatch.setattr(reindexing.vector_index, "check_embedding_storage", lambda: preflight("schema"))
    monkeypatch.setattr(reindexing, "embed_texts", lambda _: preflight("embedding"))
    delete = MagicMock()
    monkeypatch.setattr(reindexing.vector_index, "delete_all_vectors", delete)
    monkeypatch.setattr(
        reindexing.vector_index, "index_video_transcript",
        lambda video, **_: events.append(("index", video.id)),
    )

    if failure == "none":
        result = reindexing.reindex_all_videos_embeddings()
        assert result["total_videos"] == 3
        assert events[1:-2] == [
            ("read", 1), ("index", 1), ("read", 2), ("index", 2),
            ("read", 3), ("index", 3),
        ]
    else:
        with pytest.raises(RuntimeError, match=f"{failure} failed"):
            reindexing.reindex_all_videos_embeddings()
        assert events[1] == ("read", 1)
        if failure != "read":
            delete.assert_not_called()
            assert events[1:-2] == [("read", 1)]

    assert events[0] == "lock"
    assert events[-2:] == ["close_cursor", "unlock"]
    conn.cursor.assert_called_once_with(name="videoq_reindex_videos")
    assert cursor.itersize == 10
    cursor.fetchall.assert_not_called()


@pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL is required")
@pytest.mark.parametrize("stop_early", [False, True])
def test_server_cursor_filters_orders_and_closes_on_postgres(stop_early):
    schema = f"reindex_stream_{uuid.uuid4().hex}"
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        # Everything rolls back, including the temporary schema, on assertion failure.
        try:
            conn.execute(f'CREATE SCHEMA "{schema}"')
            conn.execute(f'SET LOCAL search_path TO "{schema}"')
            conn.execute("""
                CREATE TABLE videos (
                    id bigint PRIMARY KEY, user_id text, title text, transcript text,
                    status text, source_type text DEFAULT 'uploaded', file text,
                    youtube_video_id text
                )
            """)
            conn.execute("""
                INSERT INTO videos (id, user_id, title, transcript, status)
                SELECT i, 'owner', 'Video ' || i, 'Subtitle ' || i, 'completed'
                  FROM generate_series(25, 1, -1) i
            """)
            conn.execute("UPDATE videos SET transcript = NULL WHERE id = 1")
            conn.execute("UPDATE videos SET transcript = '' WHERE id = 2")
            conn.execute("UPDATE videos SET status = 'indexing' WHERE id = 3")

            def consume():
                with stream_completed_videos_with_transcript(conn) as videos:
                    first = next(videos)
                    assert first.id == 4
                    assert first.transcript == "Subtitle 4"
                    assert first.user_id == "owner"
                    assert conn.execute(
                        "SELECT 1 FROM pg_cursors WHERE name = 'videoq_reindex_videos'"
                    ).fetchone()
                    if stop_early:
                        raise RuntimeError("stop")
                    assert [video.id for video in videos] == list(range(5, 26))

            if stop_early:
                with pytest.raises(RuntimeError, match="stop"):
                    consume()
            else:
                consume()
            assert not conn.execute(
                "SELECT 1 FROM pg_cursors WHERE name = 'videoq_reindex_videos'"
            ).fetchone()
            conn.execute("DELETE FROM videos")
            with stream_completed_videos_with_transcript(conn) as videos:
                assert list(videos) == []
        finally:
            conn.rollback()
