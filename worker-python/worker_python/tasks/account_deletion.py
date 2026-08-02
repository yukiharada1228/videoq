"""delete_account_data — bulk user data deletion via SQL."""

from __future__ import annotations

import logging

from worker_python.db import db_connection
from worker_python.video_sql import delete_video_cascade

logger = logging.getLogger(__name__)


def _delete_all_videos_for_user(conn, user_id: int) -> None:
    rows = conn.execute(
        "SELECT id, file FROM app_video WHERE user_id = %s ORDER BY id",
        (user_id,),
    ).fetchall()

    for row in rows:
        video_id = int(row["id"])
        file_key = row.get("file") or None
        delete_video_cascade(conn, video_id, user_id)
        if file_key:
            # TODO: delete object from R2/S3 when storage gateway is wired for worker-python.
            logger.info(
                "Storage delete stub for video %d file=%r (user %d)",
                video_id,
                file_key,
                user_id,
            )


def _delete_chat_history_for_user(conn, user_id: int) -> None:
    # ChatLogEvaluation cascades via FK ON DELETE CASCADE (Django OneToOne).
    conn.execute("DELETE FROM app_chatlog WHERE user_id = %s", (user_id,))


def _delete_video_groups_for_user(conn, user_id: int) -> None:
    # VideoGroupMember cascades when group is deleted.
    conn.execute("DELETE FROM app_videogroup WHERE user_id = %s", (user_id,))


def _delete_tags_for_user(conn, user_id: int) -> None:
    # VideoTag rows should already be gone with videos; delete remaining tags.
    conn.execute("DELETE FROM app_tag WHERE user_id = %s", (user_id,))


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
