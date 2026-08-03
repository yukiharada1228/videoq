"""Enqueue native job messages to SQS (same shape as apps/api lib/jobs.ts)."""

from __future__ import annotations

import json
import logging
import os
import uuid
from typing import Any

from worker_python.sqs_client import create_sqs_client

logger = logging.getLogger(__name__)


def build_job_message(
    job_type: str,
    payload: dict[str, Any] | None = None,
    *,
    job_id: str | None = None,
) -> dict[str, Any]:
    return {
        "type": job_type,
        "job_id": job_id or str(uuid.uuid4()),
        "payload": payload or {},
    }


def enqueue_job(
    job_type: str,
    payload: dict[str, Any] | None = None,
) -> str | None:
    """
    Send a native job message to SQS when configured.

    Returns MessageId, or None when SQS is not configured (caller should fall back).
    """
    queue_url = os.environ.get("SQS_QUEUE_URL", "").strip()
    if not queue_url:
        logger.info("SQS_QUEUE_URL unset; skip enqueue for %s payload=%s", job_type, payload)
        return None

    client = create_sqs_client()
    body = json.dumps(build_job_message(job_type, payload))
    resp = client.send_message(QueueUrl=queue_url, MessageBody=body)
    message_id = resp.get("MessageId")
    logger.info("Enqueued %s payload=%s messageId=%s", job_type, payload, message_id)
    return message_id
