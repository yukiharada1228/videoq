"""delete_account_data — bulk user data deletion via SQL + object storage."""

from __future__ import annotations

import logging

from worker_python.db import db_connection
from worker_python.pipeline import vector_index
from worker_python.pipeline.storage import delete_object
from worker_python.video_sql import delete_video_cascade

logger = logging.getLogger(__name__)


def _delete_all_videos_for_user(conn, user_id: int) -> None:
    rows = conn.execute(
        "SELECT id, file FROM videos WHERE user_id = %s ORDER BY id",
        (user_id,),
    ).fetchall()

    for row in rows:
        video_id = int(row["id"])
        file_key = row.get("file") or None
        try:
            vector_index.delete_video_vectors(conn, video_id)
        except Exception:
            logger.exception("Vector delete failed for video %d", video_id)
        delete_video_cascade(conn, video_id, user_id)
        if file_key:
            try:
                delete_object(str(file_key))
            except Exception:
                logger.exception(
                    "Storage delete failed for video %d file=%r", video_id, file_key
                )


def _delete_chat_history_for_user(conn, user_id: int) -> None:
    conn.execute("DELETE FROM chat_logs WHERE user_id = %s", (user_id,))


def _delete_video_groups_for_user(conn, user_id: int) -> None:
    conn.execute("DELETE FROM video_groups WHERE user_id = %s", (user_id,))


def _delete_tags_for_user(conn, user_id: int) -> None:
    conn.execute("DELETE FROM tags WHERE user_id = %s", (user_id,))


def delete_account_data(user_id: int) -> None:
    """
    Delete all user-owned data in the same order as DeleteAccountDataUseCase:
    videos → chat history → video groups → tags.
    """
    logger.info("Account deletion task started for user %s", user_id)

    steps = [
        ("delete_all_videos_for_user", _delete_all_videos_for_user),
        ("delete_chat_history_for_user", _delete_chat_history_for_user),
        ("delete_video_groups_for_user", _delete_video_groups_for_user),
        ("delete_tags_for_user", _delete_tags_for_user),
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

    logger.info("Account data deletion completed for user %s", user_id)
