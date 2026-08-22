from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import MagicMock

from worker_python import advisory_locks


def test_video_vector_lock_is_shared_globally_and_exclusive_per_video(
    monkeypatch,
) -> None:
    conn = MagicMock()

    @contextmanager
    def fake_connection():
        yield conn

    monkeypatch.setattr(advisory_locks, "db_connection", fake_connection)

    with advisory_locks.video_vector_write_lock(42):
        pass

    statements = [call.args[0] for call in conn.execute.call_args_list]
    assert "pg_advisory_lock_shared" in statements[0]
    assert "pg_advisory_lock(hashtextextended" in statements[1]
    assert "pg_advisory_unlock(hashtextextended" in statements[2]
    assert "pg_advisory_unlock_shared" in statements[3]


def test_full_vector_lock_waits_for_every_vector_writer(monkeypatch) -> None:
    conn = MagicMock()

    @contextmanager
    def fake_connection():
        yield conn

    monkeypatch.setattr(advisory_locks, "db_connection", fake_connection)

    with advisory_locks.full_vector_write_lock() as lock_connection:
        assert lock_connection is conn

    statements = [call.args[0] for call in conn.execute.call_args_list]
    assert "pg_advisory_lock(%s)" in statements[0]
    assert "pg_advisory_unlock(%s)" in statements[1]
