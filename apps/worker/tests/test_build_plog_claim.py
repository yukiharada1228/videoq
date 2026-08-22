from __future__ import annotations

from unittest.mock import MagicMock

from worker_python.tasks.build_plog import _claim_build_job


def test_claim_build_job_returns_one_pending_job() -> None:
    conn = MagicMock()
    locked = MagicMock()
    inserted = MagicMock()
    inserted.fetchone.return_value = {"id": 7}
    claimed = MagicMock()
    claimed.fetchone.return_value = {"id": 7}
    conn.execute.side_effect = [locked, inserted, claimed]

    assert _claim_build_job(conn, 42) == 7
    assert "FOR UPDATE" in conn.execute.call_args_list[0].args[0]
    claim_sql = conn.execute.call_args_list[2].args[0]
    assert "status = 'pending'" in claim_sql
    assert "RETURNING id" in claim_sql


def test_claim_build_job_skips_duplicate_delivery_while_running() -> None:
    conn = MagicMock()
    locked = MagicMock()
    inserted = MagicMock()
    inserted.fetchone.return_value = None
    claimed = MagicMock()
    claimed.fetchone.return_value = None
    conn.execute.side_effect = [locked, inserted, claimed]

    assert _claim_build_job(conn, 42) is None


def test_claim_build_job_can_reclaim_an_abandoned_running_job() -> None:
    conn = MagicMock()
    locked = MagicMock()
    inserted = MagicMock()
    inserted.fetchone.return_value = None
    claimed = MagicMock()
    claimed.fetchone.return_value = {"id": 7}
    conn.execute.side_effect = [locked, inserted, claimed]

    assert _claim_build_job(conn, 42) == 7
    claim_sql = conn.execute.call_args_list[2].args[0]
    assert "status = 'running'" in claim_sql
    assert "updated_at < NOW()" in claim_sql
