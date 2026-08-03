"""Decode-only tests (no DATABASE_URL required)."""

from __future__ import annotations

import base64
import json
from unittest.mock import patch

from worker_python.contracts import JOB_TRANSCRIBE_VIDEO
from worker_python.lambda_handler import _execute_task


def test_execute_task_decodes_native_message() -> None:
    body = json.dumps(
        {
            "type": JOB_TRANSCRIBE_VIDEO,
            "job_id": "job-1",
            "payload": {"video_id": 42},
        }
    )
    with patch("worker_python.lambda_handler.get_task") as get_task:
        fn = get_task.return_value
        _execute_task(body)
        get_task.assert_called_once_with(JOB_TRANSCRIBE_VIDEO)
        fn.assert_called_once_with(42)


def test_execute_task_decodes_outer_base64() -> None:
    payload = {
        "type": JOB_TRANSCRIBE_VIDEO,
        "job_id": "job-2",
        "payload": {"video_id": 7},
    }
    outer = base64.b64encode(json.dumps(payload).encode()).decode()
    with patch("worker_python.lambda_handler.get_task") as get_task:
        fn = get_task.return_value
        _execute_task(outer)
        fn.assert_called_once_with(7)
