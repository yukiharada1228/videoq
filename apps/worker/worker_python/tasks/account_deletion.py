"""delete_account_data — hard-delete user-owned data, then the user row."""

from __future__ import annotations

import logging

from worker_python.advisory_locks import video_vector_write_lock
from worker_python.db import db_connection
from worker_python.pipeline import vector_index
from worker_python.pipeline.storage import delete_object
from worker_python.video_sql import delete_video_cascade

logger = logging.getLogger(__name__)


def _delete_all_videos_for_user(conn, user_id: str) -> None:
    rows = conn.execute(
        "SELECT id, file FROM videos WHERE user_id = %s ORDER BY id",
        (user_id,),
    ).fetchall()

    for row in rows:
        video_id = int(row["id"])
        file_key = row.get("file") or None
        with video_vector_write_lock(video_id):
            try:
                vector_index.delete_video_vectors(video_id)
            except Exception:
                logger.exception("Vector delete failed for video %d", video_id)
            delete_video_cascade(conn, video_id, user_id)
            if file_key:
                # DB削除はこのstepのcommit前。R2削除に失敗したらtransactionをrollbackし、
                # SQSの再試行で同じ動画を安全にやり直す。
                delete_object(str(file_key))


def _delete_chat_history_for_user(conn, user_id: str) -> None:
    conn.execute("DELETE FROM chat_logs WHERE user_id = %s", (user_id,))


def _delete_owned_courses_for_user(conn, user_id: str) -> None:
    """Delete owned courses across the video_groups -> video_courses rollout."""
    tables = conn.execute(
        """
        SELECT to_regclass('video_courses') AS video_courses,
               to_regclass('video_groups') AS video_groups
        """
    ).fetchone()
    if tables and tables.get("video_courses") is not None:
        conn.execute("DELETE FROM video_courses WHERE user_id = %s", (user_id,))
        return
    if tables and tables.get("video_groups") is not None:
        conn.execute("DELETE FROM video_groups WHERE user_id = %s", (user_id,))
        return
    raise RuntimeError("Neither video_courses nor video_groups exists")


def _delete_tags_for_user(conn, user_id: str) -> None:
    conn.execute("DELETE FROM tags WHERE user_id = %s", (user_id,))


def _delete_remaining_vectors_for_user(_conn, user_id: str) -> None:
    vector_index.delete_user_vectors(user_id)


def _delete_user_row(conn, user_id: str) -> None:
    conn.execute("DELETE FROM users WHERE id = %s", (user_id,))


def delete_account_data(user_id: str) -> None:
    logger.info("Account deletion task started for user %s", user_id)

    steps = [
        ("delete_all_videos_for_user", _delete_all_videos_for_user),
        ("delete_chat_history_for_user", _delete_chat_history_for_user),
        ("delete_owned_courses_for_user", _delete_owned_courses_for_user),
        ("delete_tags_for_user", _delete_tags_for_user),
        ("delete_remaining_vectors_for_user", _delete_remaining_vectors_for_user),
        ("delete_user_row", _delete_user_row),
    ]

    with db_connection() as conn:
        for step_name, step in steps:
            try:
                step(conn, user_id)
                conn.commit()
            except Exception:
                conn.rollback()
                logger.exception(
                    "Account deletion step %s failed for user %s", step_name, user_id
                )
                raise

    logger.info("Account hard-deletion completed for user %s", user_id)
