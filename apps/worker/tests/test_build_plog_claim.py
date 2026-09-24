from __future__ import annotations

import os
from unittest.mock import MagicMock

import psycopg
import pytest
from psycopg.rows import dict_row

from worker_python.tasks.build_plog import _claim_build_job, _finish_build_job


def test_claim_build_job_returns_one_pending_job() -> None:
    conn = MagicMock()
    inserted = MagicMock()
    claimed = MagicMock()
    claimed.fetchone.return_value = {"id": 7}
    conn.execute.side_effect = [inserted, claimed]

    assert _claim_build_job(conn, 42) == 7
    claim_sql = conn.execute.call_args_list[1].args[0]
    assert "status = 'pending'" in claim_sql
    assert "RETURNING id" in claim_sql


def test_claim_build_job_skips_duplicate_delivery_while_running() -> None:
    conn = MagicMock()
    inserted = MagicMock()
    claimed = MagicMock()
    claimed.fetchone.return_value = None
    conn.execute.side_effect = [inserted, claimed]

    assert _claim_build_job(conn, 42) is None


def test_claim_build_job_can_reclaim_an_abandoned_running_job() -> None:
    conn = MagicMock()
    inserted = MagicMock()
    claimed = MagicMock()
    claimed.fetchone.return_value = {"id": 7}
    conn.execute.side_effect = [inserted, claimed]

    assert _claim_build_job(conn, 42) == 7
    claim_sql = conn.execute.call_args_list[1].args[0]
    assert "status = 'running'" in claim_sql
    assert "updated_at < NOW()" in claim_sql


@pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"), reason="DATABASE_URL is required"
)
@pytest.mark.parametrize("status", ["ready", "failed"])
def test_build_claim_and_completion_on_postgresql(status) -> None:
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as conn:
        conn.execute("CREATE TEMP TABLE videos (id integer PRIMARY KEY)")
        conn.execute("""
            CREATE TEMP TABLE plog_build_jobs (
                id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                video_id integer REFERENCES videos(id), status text NOT NULL,
                error_message text NOT NULL, input_tokens integer NOT NULL,
                output_tokens integer NOT NULL, created_at timestamptz NOT NULL,
                updated_at timestamptz NOT NULL, finished_at timestamptz
            )
        """)
        conn.execute("""
            CREATE UNIQUE INDEX active_build ON plog_build_jobs(video_id)
            WHERE status IN ('pending', 'running')
        """)
        conn.execute("INSERT INTO videos VALUES (42)")
        conn.execute("SELECT 1 FROM videos WHERE id = 42 FOR UPDATE")

        job_id = _claim_build_job(conn, 42)
        assert job_id is not None
        assert _claim_build_job(conn, 42) is None
        error = "Provider failed" if status == "failed" else ""
        _finish_build_job(conn, job_id, status=status, error_message=error)
        conn.commit()

        row = conn.execute(
            "SELECT * FROM plog_build_jobs WHERE id = %s", (job_id,)
        ).fetchone()
        assert row["status"] == status
        assert row["error_message"] == error
        assert row["input_tokens"] == row["output_tokens"] == 0
        assert row["finished_at"] is not None
        conn.execute("SELECT 1 FROM videos WHERE id = 42 FOR UPDATE")
        next_job_id = _claim_build_job(conn, 42)
        assert next_job_id is not None and next_job_id != job_id
