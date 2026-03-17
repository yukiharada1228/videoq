"""
AWS Lambda ハンドラー: SQS トリガーによる Celery タスク実行

SQS メッセージフォーマット (Celery kombu SQS transport):
{
  "body": "<base64 エンコードされた Celery タスク本体>",
  "headers": {
    "task": "app.entrypoints.tasks.transcription.transcribe_video",
    "id": "<task-uuid>",
    ...
  },
  "properties": { ... },
  "content-type": "application/json",
  "content-encoding": "utf-8"
}

Celery ワーカープロセスを起動せず、タスク関数を直接 apply() で同期実行する。
失敗したメッセージは batchItemFailures で返し SQS DLQ へ転送する。
"""
import base64
import json
import logging
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "videoq.settings")

import django

django.setup()

# すべてのタスクを Celery レジストリに登録
from app.celery_config import app as celery_app  # noqa: E402

logger = logging.getLogger(__name__)


def handler(event: dict, context: object) -> dict:
    """
    SQS バッチメッセージを処理するエントリポイント。

    Returns:
        batchItemFailures 形式のレスポンス。
        失敗したメッセージのみ DLQ へ転送され、成功分は削除される。
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
    SQS メッセージ本体をデコードして Celery タスクを同期実行する。

    Celery の kombu SQS transport は以下の形式でメッセージを送信する:
    - body フィールド: base64(json([args, kwargs, options]))
    - headers フィールド: タスク名・ID 等のメタデータ

    Raises:
        KeyError: 未登録のタスク名
        Exception: タスク実行中の例外 (batchItemFailures 経由で DLQ へ)
    """
    sqs_payload = json.loads(raw_body)

    task_name: str = sqs_payload["headers"]["task"]
    task_id: str = sqs_payload["headers"].get("id", "unknown")

    # base64 デコード → JSON パース → [args, kwargs, embed]
    decoded = base64.b64decode(sqs_payload["body"]).decode("utf-8")
    args, kwargs, _ = json.loads(decoded)

    logger.info(
        "Dispatching task: name=%s id=%s args=%s kwargs=%s",
        task_name, task_id, args, kwargs,
    )

    task = celery_app.tasks[task_name]
    # apply() は同期実行。Lambda 内では Celery ワーカーループ不要。
    # throw=True にすることで例外が呼び出し元に伝播し DLQ 転送が機能する。
    result = task.apply(args=args, kwargs=kwargs, task_id=task_id, throw=True)
    result.get(propagate=True)
