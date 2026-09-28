from __future__ import annotations

import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from threading import Barrier
from unittest.mock import MagicMock

import psycopg
import pytest
from psycopg import sql
from psycopg.rows import dict_row

from worker_python.tasks.evaluation import _save_evaluation
from worker_python.tasks import evaluation as evaluation_task
from worker_python.pipeline import evaluation as evaluation_pipeline


def save(conn, *, score=0.7, status="completed"):
    _save_evaluation(
        conn,
        chat_log_id=42,
        status=status,
        faithfulness=score,
        answer_relevancy=score,
        context_precision=score,
        error_message="Provider failed" if status == "failed" else "",
        evaluated_at=None if status == "failed" else datetime.now(UTC),
    )


@pytest.mark.parametrize("existing", [False, True])
def test_evaluation_save_uses_one_database_statement(existing):
    conn = MagicMock()
    conn.execute.return_value.rowcount = int(existing)
    save(conn)
    conn.execute.assert_called_once()


@pytest.fixture
def evaluation_db():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        pytest.skip("DATABASE_URL is required for PostgreSQL integration tests")
    schema = f"evaluation_{uuid.uuid4().hex}"
    with psycopg.connect(database_url, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        try:
            admin.execute(sql.SQL("""
                CREATE TABLE {}.chat_logs (
                    id bigint PRIMARY KEY, question text NOT NULL,
                    response jsonb NOT NULL, retrieved_contexts jsonb NOT NULL
                )
            """).format(sql.Identifier(schema)))
            admin.execute(sql.SQL("""
                INSERT INTO {}.chat_logs VALUES
                    (42, 'Question', '{{"segments":[{{"text":"Answer","sourceIds":[]}}],"sources":[]}}', '[]')
            """).format(sql.Identifier(schema)))
            admin.execute(
                sql.SQL("""
                CREATE TABLE {}.chat_log_evaluations (
                    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    chat_log_id bigint NOT NULL UNIQUE REFERENCES {}.chat_logs(id) ON DELETE CASCADE,
                    status varchar(20) NOT NULL,
                    faithfulness double precision,
                    answer_relevancy double precision,
                    context_precision double precision,
                    error_message text NOT NULL,
                    evaluated_at timestamptz,
                    created_at timestamptz NOT NULL
                )
            """).format(sql.Identifier(schema), sql.Identifier(schema))
            )

            def connect():
                return psycopg.connect(
                    database_url,
                    options=f"-csearch_path={schema}",
                    row_factory=dict_row,
                )

            yield connect
        finally:
            admin.execute(
                sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema))
            )


def test_repeated_save_updates_results_without_replacing_the_evaluation(evaluation_db):
    with evaluation_db() as conn:
        save(conn)
        first = conn.execute("SELECT * FROM chat_log_evaluations").fetchone()
        assert first["faithfulness"] == 0.7
        assert first["status"] == "completed"
        assert first["evaluated_at"] is not None
        save(conn, status="failed", score=None)
        rows = conn.execute("SELECT * FROM chat_log_evaluations").fetchall()
        assert len(rows) == 1
        failed = rows[0]
        assert failed["id"] == first["id"]
        assert failed["created_at"] == first["created_at"]
        assert failed["status"] == "failed"
        assert (
            failed["faithfulness"]
            is failed["answer_relevancy"]
            is failed["context_precision"]
            is None
        )
        assert failed["evaluated_at"] is None
        assert failed["error_message"] == "Provider failed"


def test_concurrent_saves_produce_one_complete_evaluation(evaluation_db):
    ready = Barrier(2)

    def write(score):
        with evaluation_db() as conn:
            ready.wait(timeout=5)
            save(conn, score=score)

    with ThreadPoolExecutor(max_workers=2) as executor:
        list(executor.map(write, [0.3, 0.8]))
    with evaluation_db() as conn:
        rows = conn.execute("SELECT * FROM chat_log_evaluations").fetchall()
        assert len(rows) == 1
        result = rows[0]
        assert result["faithfulness"] in [0.3, 0.8]
        assert (
            result["faithfulness"]
            == result["answer_relevancy"]
            == result["context_precision"]
        )
        assert result["status"] == "completed"


def test_history_deleted_during_provider_work_does_not_fail_the_job(evaluation_db, monkeypatch):
    def score(*_):
        with evaluation_db() as conn:
            conn.execute("DELETE FROM chat_logs WHERE id = 42")
        return (0.7, 0.8, 0.9)

    provider = MagicMock(side_effect=score)
    monkeypatch.setattr(evaluation_task, "db_connection", evaluation_db)
    monkeypatch.setattr(evaluation_pipeline, "score_chat_log", provider)
    evaluation_task.evaluate_chat_log(42)
    provider.assert_called_once_with("Question", "Answer", [])
    with evaluation_db() as conn:
        assert conn.execute("SELECT * FROM chat_log_evaluations").fetchall() == []


def test_save_waiting_for_history_deletion_completes_without_a_retry(evaluation_db):
    with evaluation_db() as deleting, evaluation_db() as writing, evaluation_db() as observer:
        deleting.execute("DELETE FROM chat_logs WHERE id = 42")
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(save, writing)
            try:
                deadline = time.monotonic() + 5
                while not observer.execute("""
                    SELECT 1 FROM pg_stat_activity
                     WHERE pid = %s AND wait_event_type = 'Lock'
                """, (writing.info.backend_pid,)).fetchone():
                    observer.commit()
                    assert not future.done(), "save did not wait for the deleting transaction"
                    assert time.monotonic() < deadline, "save did not reach the row lock"
                    time.sleep(0.01)
            finally:
                deleting.commit()
            future.result(timeout=5)
        assert writing.execute("SELECT * FROM chat_log_evaluations").fetchall() == []
