from __future__ import annotations

from contextlib import nullcontext
from unittest.mock import MagicMock

import pytest

from worker_python.tasks import account_deletion


def test_storage_delete_failure_propagates_for_sqs_retry(monkeypatch) -> None:
    conn = MagicMock()
    conn.execute.return_value.fetchall.return_value = [
        {"id": 42, "file": "videos/u1/42.mp4"}
    ]
    delete_video = MagicMock()

    monkeypatch.setattr(
        account_deletion.vector_index,
        "delete_video_vectors",
        MagicMock(),
    )
    monkeypatch.setattr(
        account_deletion,
        "video_vector_write_lock",
        lambda _video_id: nullcontext(),
    )
    monkeypatch.setattr(account_deletion, "delete_video_cascade", delete_video)
    monkeypatch.setattr(
        account_deletion,
        "delete_object",
        MagicMock(side_effect=RuntimeError("R2 unavailable")),
    )

    with pytest.raises(RuntimeError, match="R2 unavailable"):
        account_deletion._delete_all_videos_for_user(conn, "u1")

    delete_video.assert_called_once_with(conn, 42, "u1")


def test_account_deletion_uses_renamed_courses_table() -> None:
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = {
        "video_courses": "video_courses",
        "video_groups": None,
    }

    account_deletion._delete_owned_courses_for_user(conn, "u1")

    conn.execute.assert_any_call(
        "DELETE FROM video_courses WHERE user_id = %s",
        ("u1",),
    )


def test_account_deletion_remains_compatible_before_course_rename() -> None:
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = {
        "video_courses": None,
        "video_groups": "video_groups",
    }

    account_deletion._delete_owned_courses_for_user(conn, "u1")

    conn.execute.assert_any_call(
        "DELETE FROM video_groups WHERE user_id = %s",
        ("u1",),
    )


def test_account_deletion_fails_if_course_table_is_missing() -> None:
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = {
        "video_courses": None,
        "video_groups": None,
    }

    with pytest.raises(RuntimeError, match="Neither video_courses nor video_groups exists"):
        account_deletion._delete_owned_courses_for_user(conn, "u1")
