from __future__ import annotations

import io
import json
from functools import partial
from unittest.mock import MagicMock

import boto3
import pytest
from botocore.exceptions import ClientError
from botocore.response import StreamingBody
from botocore.stub import Stubber

from worker_python import secrets_bootstrap, sqs_enqueue
from worker_python.pipeline import storage


@pytest.mark.parametrize("operation", ["enqueue", "download", "delete", "bootstrap"])
@pytest.mark.parametrize("fails", [False, True])
def test_one_shot_aws_operations_close_connections(
    monkeypatch, tmp_path, operation, fails
):
    service = {"enqueue": "sqs", "download": "s3", "delete": "s3", "bootstrap": "ssm"}[
        operation
    ]
    # Explicit test credentials and Stubber prevent credential discovery or network access.
    client = boto3.session.Session().client(
        service,
        region_name="us-east-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",
    )
    close = MagicMock(wraps=client.close)
    monkeypatch.setattr(client, "close", close)
    monkeypatch.setenv("USE_S3_STORAGE", "true")
    monkeypatch.setenv("R2_BUCKET_NAME", "test-media")
    queue_url = "https://sqs.us-east-1.amazonaws.com/123456789012/test"
    monkeypatch.setenv("SQS_QUEUE_URL", queue_url)

    with Stubber(client) as stub:
        if operation == "enqueue":
            monkeypatch.setattr(sqs_enqueue, "create_sqs_client", lambda: client)
            method = "send_message"
            expected = {
                "QueueUrl": queue_url,
                "MessageBody": json.dumps(
                    {
                        "type": "reindex_video_transcript",
                        "job_id": "job-1",
                        "payload": {"video_id": 42},
                    }
                ),
            }
            response = {"MessageId": "message-1"}
            run = partial(
                sqs_enqueue.enqueue_job, "reindex_video_transcript", {"video_id": 42}, job_id="job-1"
            )
        elif operation == "bootstrap":
            monkeypatch.setattr(secrets_bootstrap, "_LOADED", False)
            monkeypatch.setattr(boto3, "client", lambda _: client)
            monkeypatch.setenv("DB_PARAM_NAME", "/test/db")
            monkeypatch.setenv("DATABASE_URL", "")
            for key in (
                "APP_PARAM_NAME",
                "APP_SECRET_ARN",
                "DB_SECRET_ARN",
            ):
                monkeypatch.delenv(key, raising=False)
            method = "get_parameter"
            expected = {"Name": "/test/db", "WithDecryption": True}
            response = {
                "Parameter": {"Value": '{"DATABASE_URL":"postgresql://test/db"}'}
            }
            run = secrets_bootstrap.ensure_secrets_loaded
        else:
            monkeypatch.setattr(storage, "_s3_client", lambda: client)
            expected = {"Bucket": "test-media", "Key": "media/video.mp4"}
            if operation == "download":
                method = "head_object"
                response = {"ContentLength": 5}
                run = partial(
                    storage.download_to_path, "video.mp4", tmp_path / "video.mp4"
                )
            else:
                method = "delete_object"
                response = {}
                run = partial(storage.delete_object, "video.mp4")

        if fails:
            stub.add_client_error(
                method, "InternalError", "Unavailable", expected_params=expected
            )
        else:
            stub.add_response(method, response, expected)
            if operation == "download":
                stub.add_response(
                    "get_object",
                    {
                        "Body": StreamingBody(io.BytesIO(b"video"), 5),
                        "ContentLength": 5,
                    },
                )
        try:
            if fails:
                with pytest.raises(ClientError):
                    run()
            else:
                result = run()
                if operation == "enqueue":
                    assert result == "message-1"
                elif operation == "download":
                    assert result.read_bytes() == b"video"
            if operation == "bootstrap":
                assert secrets_bootstrap._LOADED is not fails
            stub.assert_no_pending_responses()
            close.assert_called_once()
        finally:
            # Also release the real client when running this regression against old code.
            client.close()


def test_no_ssm_client_is_created_when_database_url_is_already_configured(monkeypatch):
    monkeypatch.setattr(secrets_bootstrap, "_LOADED", False)
    monkeypatch.setenv("DB_PARAM_NAME", "/test/db")
    monkeypatch.setenv("DATABASE_URL", "postgresql://already-configured/db")
    for key in ("APP_PARAM_NAME", "APP_SECRET_ARN"):
        monkeypatch.delenv(key, raising=False)
    create = MagicMock()
    monkeypatch.setattr(boto3, "client", create)
    secrets_bootstrap.ensure_secrets_loaded()
    create.assert_not_called()
    assert secrets_bootstrap._LOADED is True


def test_invalid_job_payload_does_not_allocate_an_sqs_client(monkeypatch):
    monkeypatch.setenv("SQS_QUEUE_URL", "https://example.invalid/test")
    create = MagicMock()
    monkeypatch.setattr(sqs_enqueue, "create_sqs_client", create)
    with pytest.raises(TypeError):
        sqs_enqueue.enqueue_job("reindex_video_transcript", {"invalid": {1, 2}})
    create.assert_not_called()
