"""Enqueue Celery-envelope jobs to SQS (same shape as Hono jobs.ts)."""

from __future__ import annotations

import base64
import json
import logging
import os
import uuid
from typing import Any

from worker_python.sqs_client import create_sqs_client

logger = logging.getLogger(__name__)


def build_celery_job_message(
    task: str,
    args: list[Any],
    *,
    job_id: str | None = None,
    kwargs: dict[str, Any] | None = None,
) -> dict[str, Any]:
    inner = [args, kwargs or {}, {}]
    return {
        "headers": {"task": task, "id": job_id or str(uuid.uuid4())},
        "body": base64.b64encode(json.dumps(inner).encode("utf-8")).decode("ascii"),
    }


def enqueue_task(task: str, args: list[Any], *, kwargs: dict[str, Any] | None = None) -> str | None:
    """
    Send a Celery-envelope message to SQS when configured.

    Returns MessageId, or None when SQS is not configured (caller should fall back).
    """
    queue_url = os.environ.get("SQS_QUEUE_URL", "").strip()
    if not queue_url:
        logger.info("SQS_QUEUE_URL unset; skip enqueue for %s args=%s", task, args)
        return None

    client = create_sqs_client()
    body = json.dumps(build_celery_job_message(task, args, kwargs=kwargs))
    resp = client.send_message(QueueUrl=queue_url, MessageBody=body)
    message_id = resp.get("MessageId")
    logger.info("Enqueued %s args=%s messageId=%s", task, args, message_id)
    return message_id
