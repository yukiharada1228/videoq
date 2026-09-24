from __future__ import annotations

import os
import uuid
from contextlib import contextmanager
from unittest.mock import MagicMock

import psycopg
import pytest

from worker_python.pipeline import vector_index
from worker_python.video_sql import VideoRow


@pytest.mark.parametrize("transcript", [
    "", "plain text", "1\ninvalid --> invalid\nText", "1\n00:00:00,000 --> 00:00:01,000\n ",
])
def test_invalid_transcript_fails_before_embedding_or_replacing_existing_vectors(
    monkeypatch, transcript,
) -> None:
    connection = MagicMock(side_effect=AssertionError("Invalid input must not open a database connection"))
    check = MagicMock()
    embed = MagicMock()
    monkeypatch.setattr(vector_index, "check_embedding_storage", check)
    monkeypatch.setattr(vector_index, "embed_texts", embed)
    monkeypatch.setattr(vector_index, "db_connection", connection)
    video = VideoRow(
        id=12, user_id="owner", title="Demo", transcript=transcript,
        status="indexing", source_type="uploaded", file_key=None,
        youtube_video_id=None,
    )

    with pytest.raises(ValueError, match="no transcript|no valid SRT scenes"):
        vector_index.index_video_transcript(video)

    check.assert_not_called()
    embed.assert_not_called()
    connection.assert_not_called()


@pytest.mark.parametrize(
    ("delete", "args", "statement", "params"),
    [
        (vector_index.delete_video_vectors, (9,), 'DELETE FROM "scene_embeddings" WHERE "video_id" = %s', (9,)),
        (vector_index.delete_user_vectors, ("user-1",), 'DELETE FROM "scene_embeddings" WHERE "user_id" = %s', ("user-1",)),
        (vector_index.delete_all_vectors, (), 'DELETE FROM "scene_embeddings"', None),
    ],
)
def test_deletion_returns_affected_rows_without_initializing_search(
    monkeypatch, delete, args, statement, params,
) -> None:
    conn = MagicMock()
    conn.execute.return_value.rowcount = 2

    @contextmanager
    def connection():
        yield conn

    monkeypatch.setattr(vector_index, "db_connection", connection)
    monkeypatch.setattr(vector_index, "embed_texts", lambda _: pytest.fail("Deletion must not call the provider"))
    assert delete(*args) == 2
    conn.execute.assert_called_once_with(statement, *([] if params is None else [params]))


@pytest.mark.skipif(not os.environ.get("DATABASE_URL"), reason="DATABASE_URL is required")
def test_deletion_scopes_counts_and_commits_on_postgres(monkeypatch) -> None:
    schema = f"vector_delete_{uuid.uuid4().hex}"
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as admin:
        admin.execute(f'CREATE SCHEMA "{schema}"')
        try:
            admin.execute(f'CREATE TABLE "{schema}".scene_embeddings (id integer, video_id integer, user_id text NOT NULL)')
            admin.execute(f"INSERT INTO \"{schema}\".scene_embeddings VALUES (1, 1, 'a'), (2, 1, 'a'), (3, 2, 'b'), (4, 3, 'a'), (5, 3, 'b')")
            monkeypatch.setenv("DATABASE_URL", psycopg.conninfo.make_conninfo(
                os.environ["DATABASE_URL"], options=f"-c search_path={schema}",
            ))
            monkeypatch.setenv("EMBEDDING_PROVIDER", "invalid")
            assert vector_index.delete_video_vectors(1) == 2
            assert vector_index.delete_user_vectors("a") == 1
            assert vector_index.delete_user_vectors("b' OR TRUE --") == 0
            assert admin.execute(f'SELECT id FROM "{schema}".scene_embeddings ORDER BY id').fetchall() == [(3,), (5,)]
            assert vector_index.delete_all_vectors() == 2
            assert vector_index.delete_all_vectors() == 0
            assert admin.execute(f'SELECT count(*) FROM "{schema}".scene_embeddings').fetchone() == (0,)
        finally:
            admin.execute(f'DROP SCHEMA "{schema}" CASCADE')
