"""evaluate_chat_log — VideoQ RAGAS evaluation task."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from worker_python.db import db_connection

logger = logging.getLogger(__name__)


def _fetch_chat_log(conn: Any, chat_log_id: int) -> dict[str, Any] | None:
    return conn.execute(
        """
        SELECT id, question, answer, retrieved_contexts
          FROM chat_logs
         WHERE id = %s
        """,
        (chat_log_id,),
    ).fetchone()


def _save_evaluation(
    conn: Any,
    *,
    chat_log_id: int,
    status: str,
    faithfulness: float | None,
    answer_relevancy: float | None,
    context_precision: float | None,
    error_message: str,
    evaluated_at: datetime | None,
) -> None:
    params = (
        status,
        faithfulness,
        answer_relevancy,
        context_precision,
        error_message,
        evaluated_at,
        chat_log_id,
    )
    updated = conn.execute(
        """
        UPDATE chat_log_evaluations
           SET status = %s,
               faithfulness = %s,
               answer_relevancy = %s,
               context_precision = %s,
               error_message = %s,
               evaluated_at = %s
         WHERE chat_log_id = %s
        """,
        params,
    )
    if updated.rowcount == 0:
        conn.execute(
            """
            INSERT INTO chat_log_evaluations
                (chat_log_id, status, faithfulness, answer_relevancy,
                 context_precision, error_message, evaluated_at, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
            """,
            (
                chat_log_id,
                status,
                faithfulness,
                answer_relevancy,
                context_precision,
                error_message,
                evaluated_at,
            ),
        )
    conn.commit()


def evaluate_chat_log(chat_log_id: int) -> None:
    """
    Run evaluation for a ChatLog and persist to chat_log_evaluations.

    Errors are recorded with status='failed' and not re-raised so the job is final.
    """
    logger.info("Evaluation task started for ChatLog %s", chat_log_id)

    with db_connection() as conn:
        chat_log = _fetch_chat_log(conn, chat_log_id)

    if chat_log is None:
        logger.warning("ChatLog %s not found; skipping evaluation.", chat_log_id)
        return

    status = "pending"
    faithfulness: float | None = None
    answer_relevancy: float | None = None
    context_precision: float | None = None
    error_message = ""
    evaluated_at: datetime | None = None

    try:
        contexts = chat_log.get("retrieved_contexts") or []
        if not isinstance(contexts, list):
            contexts = []
        from worker_python.pipeline.evaluation import score_chat_log

        faithfulness, answer_relevancy, context_precision = score_chat_log(
            chat_log["question"],
            chat_log["answer"],
            contexts,
        )
        status = "completed"
        evaluated_at = datetime.now(tz=UTC)
    except Exception as exc:
        logger.exception("RAGAS evaluation failed for ChatLog %s", chat_log_id)
        status = "failed"
        error_message = str(exc)

    with db_connection() as conn:
        _save_evaluation(
            conn,
            chat_log_id=chat_log_id,
            status=status,
            faithfulness=faithfulness,
            answer_relevancy=answer_relevancy,
            context_precision=context_precision,
            error_message=error_message,
            evaluated_at=evaluated_at,
        )

    logger.info("Evaluation task finished for ChatLog %s (status=%s)", chat_log_id, status)
