from __future__ import annotations

from unittest.mock import MagicMock

from worker_python.video_sql import reserve_processing_seconds


def _connection(*rows):
    conn = MagicMock()
    results = []
    for row in rows:
        cursor = MagicMock()
        cursor.fetchone.return_value = row
        results.append(cursor)
    conn.execute.side_effect = results
    return conn


def test_processing_reservation_is_idempotent_per_video() -> None:
    conn = _connection({"user_id": "u1", "processing_seconds": 30})

    result = reserve_processing_seconds(conn, 10, 30)

    assert result.allowed is True
    assert result.already_reserved is True
    assert conn.execute.call_count == 1


def test_processing_reservation_uses_conditional_user_update() -> None:
    conn = _connection(
        {"user_id": "u1", "processing_seconds": 0},
        {"used_processing_seconds": 30},
        None,
    )

    result = reserve_processing_seconds(conn, 10, 30)

    assert result.allowed is True
    quota_sql = conn.execute.call_args_list[1].args[0]
    assert "processing_limit_minutes" in quota_sql
    assert "is_over_quota IS NOT TRUE" in quota_sql
    assert "RETURNING used_processing_seconds" in quota_sql


def test_processing_reservation_rejects_without_marking_video() -> None:
    conn = _connection(
        {"user_id": "u1", "processing_seconds": 0},
        None,
        {"processing_limit_minutes": 1, "is_over_quota": False},
    )

    result = reserve_processing_seconds(conn, 10, 61)

    assert result.allowed is False
    assert result.limit_seconds == 60
    assert conn.execute.call_count == 3
