from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import MagicMock

import pytest

from worker_python import job_execution


def _cursor(row):
    cursor = MagicMock()
    cursor.fetchone.return_value = row
    return cursor


def _connection(monkeypatch, *rows):
    conn = MagicMock()
    conn.execute.side_effect = [_cursor(row) for row in rows]

    @contextmanager
    def transaction():
        yield conn

    monkeypatch.setattr(job_execution, "db_transaction", transaction)
    monkeypatch.setattr(job_execution.uuid, "uuid4", lambda: "lease-token")
    return conn


def test_claims_new_job_once(monkeypatch) -> None:
    conn = _connection(monkeypatch, {"job_id": "job-1"})

    assert job_execution.claim_job_execution("job-1", "build_plog", {"video_id": 1}) == (
        "lease-token"
    )
    assert "ON CONFLICT (job_id) DO NOTHING" in conn.execute.call_args.args[0]


def test_completed_duplicate_is_not_claimed(monkeypatch) -> None:
    _connection(
        monkeypatch,
        None,
        {
            "job_type": "build_plog",
            "payload_sha256": job_execution._payload_sha256(
                "build_plog", {"video_id": 1}
            ),
            "status": "completed",
            "lease_active": False,
        },
    )

    assert (
        job_execution.claim_job_execution("job-1", "build_plog", {"video_id": 1})
        is None
    )


def test_active_duplicate_is_retried_instead_of_acknowledged(monkeypatch) -> None:
    _connection(
        monkeypatch,
        None,
        {
            "job_type": "build_plog",
            "payload_sha256": job_execution._payload_sha256(
                "build_plog", {"video_id": 1}
            ),
            "status": "running",
            "lease_active": True,
        },
    )

    with pytest.raises(job_execution.JobExecutionBusyError):
        job_execution.claim_job_execution("job-1", "build_plog", {"video_id": 1})


def test_failed_job_is_reclaimed_with_a_new_lease(monkeypatch) -> None:
    _connection(
        monkeypatch,
        None,
        {
            "job_type": "build_plog",
            "payload_sha256": job_execution._payload_sha256(
                "build_plog", {"video_id": 1}
            ),
            "status": "failed",
            "lease_active": False,
        },
        {"job_id": "job-1"},
    )

    assert job_execution.claim_job_execution("job-1", "build_plog", {"video_id": 1}) == (
        "lease-token"
    )


def test_reused_job_id_with_different_payload_is_rejected(monkeypatch) -> None:
    _connection(
        monkeypatch,
        None,
        {
            "job_type": "build_plog",
            "payload_sha256": "different",
            "status": "completed",
            "lease_active": False,
        },
    )

    with pytest.raises(job_execution.JobIdentityConflictError):
        job_execution.claim_job_execution("job-1", "build_plog", {"video_id": 1})
