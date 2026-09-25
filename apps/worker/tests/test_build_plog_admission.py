"""Read PLOG input under the same video lock used to admit its build job."""

import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import MagicMock

import psycopg
import pytest
from psycopg import sql
from psycopg.rows import dict_row

from worker_python.tasks import build_plog


@pytest.fixture
def database(monkeypatch):
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL is required")
    schema = f"plog_admission_{uuid.uuid4().hex}"
    statements = []
    with psycopg.connect(url, autocommit=True, row_factory=dict_row) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        try:
            admin.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
            admin.execute("""
                CREATE TABLE videos (
                    id integer PRIMARY KEY, user_id text DEFAULT 'owner', title text DEFAULT 'Lecture',
                    transcript text DEFAULT 'Original transcript', status text DEFAULT 'completed',
                    source_type text DEFAULT 'uploaded', file text, youtube_video_id text
                );
                CREATE TABLE plog_build_jobs (
                    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    video_id integer REFERENCES videos(id), status text NOT NULL,
                    error_message text NOT NULL, input_tokens integer NOT NULL,
                    output_tokens integer NOT NULL, created_at timestamptz NOT NULL,
                    updated_at timestamptz NOT NULL, finished_at timestamptz
                );
                CREATE UNIQUE INDEX active_build ON plog_build_jobs(video_id)
                    WHERE status IN ('pending', 'running');
                INSERT INTO videos(id) VALUES (42);
            """)

            @contextmanager
            def connection():
                with psycopg.connect(url, options=f"-c search_path={schema}",
                                     application_name=schema, row_factory=dict_row) as conn:
                    def execute(statement, *args):
                        statements.append(statement)
                        return conn.execute(statement, *args)
                    yield SimpleNamespace(execute=execute, commit=conn.commit)

            generate = MagicMock(return_value=None)
            monkeypatch.setattr(build_plog, "db_connection", connection)
            monkeypatch.setattr(build_plog, "generate_plog_artifacts", generate)
            yield SimpleNamespace(admin=admin, url=url, schema=schema,
                                  statements=statements, generate=generate)
        finally:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


def test_build_reads_only_the_transcript_once(database):
    build_plog.build_plog_artifacts(42)

    database.generate.assert_called_once_with(42, "Original transcript")
    reads = [statement for statement in database.statements if "FROM videos" in statement]
    assert len(reads) == 1
    assert "SELECT transcript" in reads[0]
    assert "FOR UPDATE" in reads[0]
    assert database.admin.execute("SELECT status FROM plog_build_jobs").fetchall() == [{"status": "ready"}]


@pytest.mark.parametrize("transcript", [None, ""])
def test_missing_transcript_does_not_create_work(database, transcript):
    database.admin.execute("UPDATE videos SET transcript = %s WHERE id = 42", (transcript,))
    with pytest.raises(ValueError, match="missing or has no transcript"):
        build_plog.build_plog_artifacts(42)
    database.generate.assert_not_called()
    assert database.admin.execute("SELECT * FROM plog_build_jobs").fetchall() == []


def test_duplicate_running_build_does_not_call_ai(database):
    database.admin.execute("""
        INSERT INTO plog_build_jobs
            (video_id, status, error_message, input_tokens, output_tokens, created_at, updated_at)
        VALUES (42, 'running', '', 0, 0, now(), now())
    """)
    build_plog.build_plog_artifacts(42)
    database.generate.assert_not_called()
    assert database.admin.execute("SELECT status FROM plog_build_jobs").fetchall() == [{"status": "running"}]


@pytest.mark.parametrize("change", ["replace", "clear", "delete"])
def test_build_uses_the_input_after_waiting_for_a_concurrent_edit(database, change):
    with psycopg.connect(database.url, options=f"-c search_path={database.schema}") as writer:
        writer.execute("SELECT 1 FROM videos WHERE id = 42 FOR UPDATE")
        with ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(build_plog.build_plog_artifacts, 42)
            try:
                deadline = time.monotonic() + 5
                while not database.admin.execute("""
                    SELECT 1 FROM pg_stat_activity
                     WHERE application_name = %s AND cardinality(pg_blocking_pids(pid)) > 0
                """, (database.schema,)).fetchone():
                    assert time.monotonic() < deadline, "PLOG build did not wait for the video lock"
                    time.sleep(0.01)
                if change == "delete":
                    writer.execute("DELETE FROM videos WHERE id = 42")
                else:
                    writer.execute("UPDATE videos SET transcript = %s WHERE id = 42",
                                   ("Updated transcript" if change == "replace" else "",))
                writer.commit()
                if change == "replace":
                    pending.result(timeout=5)
                    database.generate.assert_called_once_with(42, "Updated transcript")
                    assert database.admin.execute("SELECT status FROM plog_build_jobs").fetchall() == [{"status": "ready"}]
                else:
                    with pytest.raises(ValueError, match="missing or has no transcript"):
                        pending.result(timeout=5)
                    database.generate.assert_not_called()
                    assert database.admin.execute("SELECT * FROM plog_build_jobs").fetchall() == []
            finally:
                writer.rollback()
