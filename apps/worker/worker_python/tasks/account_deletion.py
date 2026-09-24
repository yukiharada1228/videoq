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
        "SELECT id FROM videos WHERE user_id = %s ORDER BY id",
        (user_id,),
    ).fetchall()
    # End the scan transaction so each video gets its own commit/rollback.
    conn.commit()

    for row in rows:
        video_id = int(row["id"])
        # Finish the transaction before admitting another vector writer.
        with video_vector_write_lock(video_id), conn.transaction():
            video = conn.execute(
                "SELECT file FROM videos WHERE id = %s AND user_id = %s FOR UPDATE",
                (video_id, user_id),
            ).fetchone()
            if video is None:
                continue
            vector_index.delete_video_vectors(video_id, conn=conn)
            delete_video_cascade(conn, video_id, user_id)
            file_key = video.get("file")
            if file_key:
                # On storage failure, preserve this video's DB rows for retry.
                delete_object(str(file_key))


def _delete_chat_history_for_user(conn, user_id: str) -> None:
    conn.execute("DELETE FROM chat_logs WHERE user_id = %s", (user_id,))


def _delete_video_courses_for_user(conn, user_id: str) -> None:
    conn.execute("DELETE FROM video_courses WHERE user_id = %s", (user_id,))


def _delete_tags_for_user(conn, user_id: str) -> None:
    conn.execute("DELETE FROM tags WHERE user_id = %s", (user_id,))


def _delete_remaining_vectors_for_user(conn, user_id: str) -> None:
    vector_index.delete_user_vectors(user_id, conn=conn)


def _delete_user_row(conn, user_id: str) -> None:
    conn.execute("DELETE FROM users WHERE id = %s", (user_id,))


def delete_account_data(user_id: str) -> None:
    logger.info("Account deletion task started for user %s", user_id)

    steps = [
        ("delete_all_videos_for_user", _delete_all_videos_for_user),
        ("delete_chat_history_for_user", _delete_chat_history_for_user),
        ("delete_video_courses_for_user", _delete_video_courses_for_user),
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
