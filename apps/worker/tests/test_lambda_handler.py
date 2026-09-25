"""Decode-only tests (no DATABASE_URL required)."""

from __future__ import annotations

import base64
import json
from unittest.mock import MagicMock, patch

import pytest

from worker_python.contracts import JOB_DELETE_ACCOUNT_DATA, JOB_TRANSCRIBE_VIDEO
from worker_python.lambda_handler import _execute_task


def test_execute_task_decodes_native_message() -> None:
    body = json.dumps(
        {
            "type": JOB_TRANSCRIBE_VIDEO,
            "job_id": "job-1",
            "payload": {"video_id": 42},
        }
    )
    with (
        patch(
            "worker_python.lambda_handler.claim_job_execution",
            return_value="lease-1",
        ),
        patch("worker_python.lambda_handler.complete_job_execution") as complete,
        patch("worker_python.lambda_handler.get_task") as get_task,
    ):
        fn = get_task.return_value
        _execute_task(body)
        get_task.assert_called_once_with(JOB_TRANSCRIBE_VIDEO)
        fn.assert_called_once_with(42, job_id="job-1")
        complete.assert_called_once_with("job-1", "lease-1")


def test_execute_task_decodes_outer_base64() -> None:
    payload = {
        "type": JOB_TRANSCRIBE_VIDEO,
        "job_id": "job-2",
        "payload": {"video_id": 7},
    }
    outer = base64.b64encode(json.dumps(payload).encode()).decode()
    with (
        patch(
            "worker_python.lambda_handler.claim_job_execution",
            return_value="lease-2",
        ),
        patch("worker_python.lambda_handler.complete_job_execution"),
        patch("worker_python.lambda_handler.get_task") as get_task,
    ):
        fn = get_task.return_value
        _execute_task(outer)
        fn.assert_called_once_with(7, job_id="job-2")


def test_execute_task_passes_uuid_user_id_for_account_deletion() -> None:
    user_id = "00000000-0000-4000-8000-000000000009"
    body = json.dumps(
        {
            "type": JOB_DELETE_ACCOUNT_DATA,
            "job_id": "job-del",
            "payload": {"user_id": user_id},
        }
    )
    with (
        patch(
            "worker_python.lambda_handler.claim_job_execution",
            return_value="lease-del",
        ),
        patch("worker_python.lambda_handler.complete_job_execution"),
        patch("worker_python.lambda_handler.get_task") as get_task,
    ):
        fn = get_task.return_value
        _execute_task(body)
        get_task.assert_called_once_with(JOB_DELETE_ACCOUNT_DATA)
        fn.assert_called_once_with(user_id)


def test_execute_task_skips_completed_duplicate_job_id() -> None:
    body = json.dumps(
        {
            "type": JOB_TRANSCRIBE_VIDEO,
            "job_id": "job-duplicate",
            "payload": {"video_id": 42},
        }
    )
    with (
        patch("worker_python.lambda_handler.claim_job_execution", return_value=None),
        patch("worker_python.lambda_handler.get_task") as get_task,
    ):
        _execute_task(body)

    get_task.assert_not_called()


def test_execute_task_releases_lease_for_sqs_retry_on_failure() -> None:
    body = json.dumps(
        {
            "type": JOB_TRANSCRIBE_VIDEO,
            "job_id": "job-failed",
            "payload": {"video_id": 42},
        }
    )
    with (
        patch(
            "worker_python.lambda_handler.claim_job_execution",
            return_value="lease-failed",
        ),
        patch("worker_python.lambda_handler.fail_job_execution") as fail,
        patch("worker_python.lambda_handler.get_task") as get_task,
    ):
        get_task.return_value = MagicMock(side_effect=RuntimeError("boom"))
        with pytest.raises(RuntimeError, match="boom"):
            _execute_task(body)

    fail.assert_called_once_with("job-failed", "lease-failed", "boom")


@pytest.mark.parametrize(
    "message, expected",
    [
        ({"type": "", "job_id": "job-1", "payload": {}}, "type"),
        ({"type": "x" * 65, "job_id": "job-1", "payload": {}}, "type"),
        ({"type": JOB_TRANSCRIBE_VIDEO, "job_id": "job-1", "payload": []}, "payload"),
    ],
)
def test_execute_task_validates_job_envelope(message: dict, expected: str) -> None:
    with pytest.raises(ValueError, match=expected):
        _execute_task(json.dumps(message))
