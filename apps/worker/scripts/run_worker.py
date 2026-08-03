#!/usr/bin/env python3
"""
Local SQS/ElasticMQ poller — Lambda substitute for apps/worker.

Long-polls SQS_QUEUE_URL, feeds each message to lambda_handler.handler,
and deletes successful messages (failed ones become visible again / DLQ).

  docker compose up -d postgres minio minio-init elasticmq
  export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres
  export SQS_QUEUE_URL=http://127.0.0.1:9324/000000000000/videoq-jobs
  export AWS_REGION=us-east-1
  # ElasticMQ accepts any keys — reuse MinIO credentials for S3 + SQS locally.
  export AWS_ACCESS_KEY_ID=minioadmin AWS_SECRET_ACCESS_KEY=minioadmin
  export USE_S3_STORAGE=true AWS_STORAGE_BUCKET_NAME=videoq-media
  export AWS_S3_ENDPOINT_URL=http://127.0.0.1:9000 AWS_S3_REGION_NAME=us-east-1
  python scripts/run_worker.py
"""

from __future__ import annotations

import logging
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from worker_python.lambda_handler import handler
from worker_python.sqs_client import create_sqs_client

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("run_worker")


def main() -> int:
    queue_url = os.environ.get("SQS_QUEUE_URL", "").strip()
    if not queue_url:
        logger.error("SQS_QUEUE_URL is required")
        return 2

    wait = int(os.environ.get("SQS_WAIT_TIME_SECONDS", "20"))
    visibility = int(os.environ.get("SQS_VISIBILITY_TIMEOUT", "900"))
    max_messages = int(os.environ.get("SQS_MAX_MESSAGES", "1"))

    client = create_sqs_client()
    logger.info(
        "Polling %s (wait=%ss visibility=%ss). Ctrl+C to stop.",
        queue_url,
        wait,
        visibility,
    )

    while True:
        try:
            resp = client.receive_message(
                QueueUrl=queue_url,
                MaxNumberOfMessages=max(1, min(max_messages, 10)),
                WaitTimeSeconds=wait,
                VisibilityTimeout=visibility,
            )
        except KeyboardInterrupt:
            logger.info("Stopped")
            return 0
        except Exception:
            logger.exception("ReceiveMessage failed; retry in 3s")
            time.sleep(3)
            continue

        messages = resp.get("Messages") or []
        if not messages:
            continue

        records = [
            {"messageId": m["MessageId"], "body": m["Body"], "receiptHandle": m["ReceiptHandle"]}
            for m in messages
        ]
        event = {
            "Records": [
                {"messageId": r["messageId"], "body": r["body"]} for r in records
            ]
        }

        try:
            result = handler(event, None)
        except Exception:
            logger.exception("handler crashed; messages will reappear after visibility timeout")
            continue

        failed = {
            item["itemIdentifier"]
            for item in (result or {}).get("batchItemFailures", [])
        }
        for r in records:
            mid = r["messageId"]
            if mid in failed:
                logger.warning("Leaving message %s for retry/DLQ", mid)
                continue
            try:
                client.delete_message(
                    QueueUrl=queue_url,
                    ReceiptHandle=r["receiptHandle"],
                )
                logger.info("Deleted message %s", mid)
            except Exception:
                logger.exception("DeleteMessage failed for %s", mid)


if __name__ == "__main__":
    raise SystemExit(main())
