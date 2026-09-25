"""
AWS Lambda / local poller handler for SQS background jobs.

Native message shape (apps/api lib/jobs.ts):

{
  "type": "evaluate_chat_log",
  "job_id": "<uuid>",
  "payload": { "chat_log_id": 123 }
}
"""

from __future__ import annotations

import base64
import json
import logging

from worker_python.job_execution import (
    claim_job_execution,
    complete_job_execution,
    fail_job_execution,
)
from worker_python.secrets_bootstrap import ensure_secrets_loaded
from worker_python.tasks.registry import get_task

logger = logging.getLogger(__name__)


def handler(event: dict, context: object) -> dict:
    ensure_secrets_loaded()
    batch_item_failures = []

    for record in event.get("Records", []):
        message_id = record["messageId"]
        try:
            _execute_task(record["body"])
            logger.info("Task completed: messageId=%s", message_id)
        except Exception:
            logger.exception("Task failed: messageId=%s", message_id)
            batch_item_failures.append({"itemIdentifier": message_id})

    return {"batchItemFailures": batch_item_failures}


def _execute_task(raw_body: str) -> None:
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, ValueError):
        payload = json.loads(base64.b64decode(raw_body).decode("utf-8"))

    job_type = payload["type"]
    job_id = payload.get("job_id")
    body = payload.get("payload", {})
    if not isinstance(job_type, str) or not job_type or len(job_type) > 64:
        raise ValueError("type must be a non-empty string of at most 64 characters")
    if not isinstance(job_id, str) or not job_id or len(job_id) > 128:
        raise ValueError("job_id must be a non-empty string of at most 128 characters")
    if not isinstance(body, dict):
        raise ValueError("payload must be an object")

    logger.info(
        "Dispatching task: type=%s id=%s payload=%s",
        job_type,
        job_id,
        body,
    )

    lease_token = claim_job_execution(job_id, job_type, body)
    if lease_token is None:
        logger.info("Skipping completed duplicate job: type=%s id=%s", job_type, job_id)
        return

    try:
        task_fn = get_task(job_type)
        _dispatch(task_fn, job_type, body, job_id)
        complete_job_execution(job_id, lease_token)
    except Exception as exc:
        try:
            fail_job_execution(job_id, lease_token, str(exc))
        except Exception:
            logger.exception("Failed to release execution lease: jobId=%s", job_id)
        raise


def _dispatch(task_fn, job_type: str, body: dict, job_id: str) -> None:
    """Map payload dict → positional args expected by existing task callables."""
    if job_type == "reindex_all_videos_embeddings":
        task_fn()
        return
    if job_type == "evaluate_chat_log":
        task_fn(int(body["chat_log_id"]))
        return
    if job_type == "delete_account_data":
        # users.id is a UUID text PK (migration 0006). int() would fail and
        # leave the admin-locked (is_active=false) row undeleted.
        task_fn(str(body["user_id"]))
        return
    if job_type in {"transcribe_video", "index_video_transcript"}:
        task_fn(int(body["video_id"]), job_id=job_id)
        return
    # video_id jobs
    task_fn(int(body["video_id"]))
