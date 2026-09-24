"""Replacing searchable scenes must be atomic and keep the shared SQL contract."""

import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from urllib.parse import urlsplit, urlunsplit

import psycopg
import pytest
from psycopg import sql
from psycopg.rows import dict_row

from worker_python.pipeline import vector_index
from worker_python.pipeline.embedding_contract import EmbeddingContractError
from worker_python.video_sql import VideoRow


VECTOR = [1.0] + [0.0] * 1535
TRANSCRIPT = "1\n00:00:00,000 --> 00:00:01,000\nFirst\n\n2\n00:00:01,000 --> 00:00:02,000\nSecond"


def video(transcript=TRANSCRIPT):
    return VideoRow(
        id=12, user_id="owner", title="Lecture 'タイトル'", transcript=transcript,
        status="indexing", source_type="uploaded", file_key=None,
        youtube_video_id=None,
    )


@pytest.fixture
def database(monkeypatch):
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL is required for PostgreSQL integration tests")
    name = f"vector_write_{uuid.uuid4().hex}"
    with psycopg.connect(url, autocommit=True) as admin:
        if not admin.execute("SELECT 1 FROM pg_available_extensions WHERE name = 'vector'").fetchone():
            pytest.skip("pgvector is required for vector persistence tests")
        admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
        try:
            test_url = urlunsplit(urlsplit(url)._replace(path=f"/{name}"))
            monkeypatch.setenv("DATABASE_URL", test_url)
            monkeypatch.setenv("EMBEDDING_PROVIDER", "openai")
            monkeypatch.setenv("EMBEDDING_MODEL", "text-embedding-3-small")
            monkeypatch.setenv("PGVECTOR_COLLECTION_NAME", "scene_embeddings")
            monkeypatch.setattr(vector_index, "embed_texts", lambda texts: [VECTOR for _ in texts])
            with psycopg.connect(test_url, autocommit=True, row_factory=dict_row) as conn:
                conn.execute("""
                    CREATE EXTENSION vector;
                    CREATE TABLE scene_embeddings (
                        langchain_id uuid PRIMARY KEY, content text NOT NULL,
                        embedding vector(1536) NOT NULL, user_id text NOT NULL,
                        video_id bigint NOT NULL, langchain_metadata json
                    );
                    CREATE TABLE vector_writes (transaction_id bigint, operation text);
                    CREATE FUNCTION record_write() RETURNS trigger LANGUAGE plpgsql AS $$
                    BEGIN
                        INSERT INTO vector_writes VALUES (txid_current(), TG_OP);
                        RETURN NULL;
                    END $$;
                """)
                for video_id, owner in [(12, "owner"), (13, "other"), (14, "owner")]:
                    conn.execute("""
                        INSERT INTO scene_embeddings VALUES (%s, %s, %s::vector, %s, %s, %s)
                    """, (uuid.uuid4(), f"Original {video_id}", str(VECTOR), owner, video_id, '{"scene_index":1}'))
                conn.execute("""
                    CREATE TRIGGER record_write AFTER INSERT OR DELETE ON scene_embeddings
                        FOR EACH ROW EXECUTE FUNCTION record_write()
                """)
                yield conn
        finally:
            admin.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name)))


def snapshot(conn):
    return conn.execute("""
        SELECT langchain_id::text, content, embedding::text, user_id,
               video_id, langchain_metadata FROM scene_embeddings ORDER BY langchain_id
    """).fetchall()


@pytest.mark.parametrize("replace_existing", [True, False])
def test_scene_writes_commit_together_and_preserve_other_videos(database, replace_existing):
    before = snapshot(database)
    assert vector_index.index_video_transcript(video(), replace_existing=replace_existing) == 2
    rows = snapshot(database)
    assert [row for row in rows if row["video_id"] != 12] == [row for row in before if row["video_id"] != 12]
    contents = sorted(row["content"] for row in rows if row["video_id"] == 12)
    assert contents == (["First", "Second"] if replace_existing else ["First", "Original 12", "Second"])
    first = next(row for row in rows if row["content"] == "First")
    assert first["user_id"] == "owner"
    assert first["langchain_metadata"] == {
        "video_title": "Lecture 'タイトル'", "start_time": "00:00:00,000",
        "end_time": "00:00:01,000", "start_sec": 0.0, "end_sec": 1.0,
        "scene_index": 1,
    }
    writes = database.execute("SELECT * FROM vector_writes").fetchall()
    assert len(writes) == (3 if replace_existing else 2)
    assert len({row["transaction_id"] for row in writes}) == 1


@pytest.mark.parametrize("replace_existing", [True, False])
@pytest.mark.parametrize("deferred", [False, True])
def test_later_insert_or_commit_failure_rolls_back_all_changes(database, replace_existing, deferred):
    database.execute("""
        CREATE FUNCTION reject_second() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected insert failure'; END $$;
    """)
    trigger = "CONSTRAINT TRIGGER reject_second AFTER" if deferred else "TRIGGER reject_second BEFORE"
    timing = "DEFERRABLE INITIALLY DEFERRED" if deferred else ""
    database.execute(f"""
        CREATE {trigger} INSERT ON scene_embeddings {timing}
            FOR EACH ROW WHEN (NEW.content = 'Second') EXECUTE FUNCTION reject_second()
    """)
    before = snapshot(database)
    with pytest.raises(psycopg.errors.RaiseException, match="injected insert failure"):
        vector_index.index_video_transcript(video(), replace_existing=replace_existing)
    assert snapshot(database) == before
    assert database.execute("SELECT * FROM vector_writes").fetchall() == []


@pytest.mark.parametrize("outcome", ["success", "provider", "missing-vector", "dimension"])
def test_embedding_batches_finish_before_writing_and_failures_preserve_scenes(database, monkeypatch, outcome):
    transcript = "\n\n".join(f"{i}\n00:00:00,000 --> 00:00:01,000\nScene {i}" for i in range(1, 66))
    before = snapshot(database)
    batches = []
    active_connections = 0
    connect = vector_index.db_connection

    @contextmanager
    def connection():
        nonlocal active_connections
        with connect() as conn:
            active_connections += 1
            try:
                yield conn
            finally:
                active_connections -= 1

    def embed(texts):
        assert active_connections == 0
        assert snapshot(database) == before
        batches.append(texts)
        if len(batches) == 2:
            if outcome == "provider":
                raise RuntimeError("provider failed")
            if outcome == "missing-vector":
                return []
            if outcome == "dimension":
                return [[1.0]]
        return [VECTOR for _ in texts]

    monkeypatch.setattr(vector_index, "db_connection", connection)
    monkeypatch.setattr(vector_index, "embed_texts", embed)
    if outcome == "success":
        assert vector_index.index_video_transcript(video(transcript)) == 65
        rows = database.execute("""
            SELECT content, langchain_metadata->>'scene_index' AS index
              FROM scene_embeddings WHERE video_id = 12
             ORDER BY (langchain_metadata->>'scene_index')::integer
        """).fetchall()
        assert rows == [{"content": f"Scene {i}", "index": str(i)} for i in range(1, 66)]
        assert database.execute("SELECT count(DISTINCT transaction_id) AS count FROM vector_writes").fetchone()["count"] == 1
    else:
        error = {"provider": RuntimeError, "missing-vector": ValueError, "dimension": psycopg.DataError}[outcome]
        with pytest.raises(error):
            vector_index.index_video_transcript(video(transcript))
        assert snapshot(database) == before
        assert database.execute("SELECT * FROM vector_writes").fetchall() == []
    assert [len(batch) for batch in batches] == [64, 1]
    assert active_connections == 0


def test_schema_failure_preserves_scenes_without_calling_provider(database, monkeypatch):
    database.execute("ALTER TABLE scene_embeddings ALTER COLUMN embedding TYPE vector")
    before = snapshot(database)
    monkeypatch.setattr(vector_index, "embed_texts", lambda _: pytest.fail("Invalid schema must not call the provider"))
    with pytest.raises(EmbeddingContractError, match="vector\\(1536\\)"):
        vector_index.index_video_transcript(video())
    assert snapshot(database) == before
    assert database.execute("SELECT * FROM vector_writes").fetchall() == []


def test_readers_keep_original_scenes_until_replacement_commits(database):
    database.execute("""
        CREATE FUNCTION wait_for_reader() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN PERFORM pg_advisory_xact_lock(194633); RETURN NEW; END $$;
        CREATE TRIGGER wait_for_reader BEFORE INSERT ON scene_embeddings
            FOR EACH ROW WHEN (NEW.content = 'First') EXECUTE FUNCTION wait_for_reader();
    """)
    before = snapshot(database)
    database.execute("SELECT pg_advisory_lock(194633)")
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(vector_index.index_video_transcript, video())
        try:
            deadline = time.monotonic() + 10
            while not database.execute("""
                SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted
                    AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
            """).fetchone():
                assert not future.done(), "writer finished before reaching the blocked insert"
                assert time.monotonic() < deadline, "writer did not reach the blocked insert"
                time.sleep(0.01)
            assert snapshot(database) == before
        finally:
            database.execute("SELECT pg_advisory_unlock(194633)")
            assert future.result(timeout=10) == 2
