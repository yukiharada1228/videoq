"""
AWS Lambda handler for executing Celery tasks triggered by SQS.

The kombu SQS transport base64-encodes the entire message and stores it in the
SQS body. The record["body"] value supplied by the Lambda SQS trigger is a
base64 string that decodes to the following JSON:

{
  "body": "<base64(json([args, kwargs, options]))>",
  "headers": {
    "task": "app.entrypoints.tasks.transcription.transcribe_video",
    "id": "<task-uuid>",
    ...
  },
  "content-type": "application/json",
  "content-encoding": "utf-8"
}

Rather than starting a Celery worker process, this handler invokes the task
function directly and synchronously with apply(). Failed messages are returned
in batchItemFailures so that SQS can route them to the DLQ.
"""
import base64
import json
import logging
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "videoq.settings")

import django

django.setup()

# Register every task with the Celery registry.
from app.celery_config import app as celery_app  # noqa: E402
celery_app.loader.import_default_modules()  # Force deferred autodiscovery.
import app.entrypoints.tasks  # noqa: E402, F401 — Ensure task registration.

logger = logging.getLogger(__name__)


def handler(event: dict, context: object) -> dict:
    """
    Process a batch of SQS messages.

    Returns:
        A response in batchItemFailures format. Only failed messages are sent
        to the DLQ; successful messages are deleted.
    """
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
    """
    Decode an SQS message body and execute the Celery task synchronously.

    The kombu SQS transport base64-encodes the entire message before sending it.
    If raw_body cannot be parsed directly as JSON, attempt base64 decoding.

    Raises:
        KeyError: The task name is not registered.
        Exception: Task execution failed. The message is sent to the DLQ via
            batchItemFailures.
    """
    # The kombu SQS transport uses base64 encoding.
    try:
        sqs_payload = json.loads(raw_body)
    except (json.JSONDecodeError, ValueError):
        sqs_payload = json.loads(base64.b64decode(raw_body).decode("utf-8"))

    task_name: str = sqs_payload["headers"]["task"]
    task_id: str = sqs_payload["headers"].get("id", "unknown")

    # Decode base64, parse JSON, and unpack [args, kwargs, embed].
    decoded = base64.b64decode(sqs_payload["body"]).decode("utf-8")
    args, kwargs, _ = json.loads(decoded)

    logger.info(
        "Dispatching task: name=%s id=%s args=%s kwargs=%s",
        task_name, task_id, args, kwargs,
    )

    task = celery_app.tasks[task_name]
    # apply() runs synchronously, so Lambda does not need a Celery worker loop.
    # throw=True propagates exceptions to the caller, enabling DLQ routing.
    result = task.apply(args=args, kwargs=kwargs, task_id=task_id, throw=True)
    result.get(propagate=True)
