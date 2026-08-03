"""Decode-only tests (no DATABASE_URL required)."""

from __future__ import annotations

import base64
import json
from unittest.mock import patch

from worker_python.contracts import TRANSCRIBE_VIDEO_TASK
from worker_python.lambda_handler import _execute_task


def test_execute_task_decodes_celery_envelope() -> None:
    inner = base64.b64encode(json.dumps([[42], {}, {}]).encode()).decode()
    body = json.dumps(
        {
            "headers": {"task": TRANSCRIBE_VIDEO_TASK, "id": "job-1"},
            "body": inner,
        }
    )
    with patch("worker_python.lambda_handler.get_task") as get_task:
        fn = get_task.return_value
        _execute_task(body)
        get_task.assert_called_once_with(TRANSCRIBE_VIDEO_TASK)
        fn.assert_called_once_with(42)


def test_execute_task_decodes_outer_base64() -> None:
    inner = base64.b64encode(json.dumps([[7], {"k": "v"}, {}]).encode()).decode()
    payload = {
        "headers": {"task": TRANSCRIBE_VIDEO_TASK, "id": "job-2"},
        "body": inner,
    }
    outer = base64.b64encode(json.dumps(payload).encode()).decode()
    with patch("worker_python.lambda_handler.get_task") as get_task:
        fn = get_task.return_value
        _execute_task(outer)
        fn.assert_called_once_with(7, k="v")
