import os

from worker_python.sqs_client import sqs_endpoint_url


def test_sqs_endpoint_from_explicit_env(monkeypatch) -> None:
    monkeypatch.setenv("AWS_ENDPOINT_URL", "http://127.0.0.1:9324/")
    monkeypatch.delenv("SQS_ENDPOINT_URL", raising=False)
    assert sqs_endpoint_url() == "http://127.0.0.1:9324"


def test_sqs_endpoint_inferred_from_elasticmq_queue(monkeypatch) -> None:
    monkeypatch.delenv("AWS_ENDPOINT_URL", raising=False)
    monkeypatch.delenv("SQS_ENDPOINT_URL", raising=False)
    monkeypatch.setenv(
        "SQS_QUEUE_URL",
        "http://127.0.0.1:9324/000000000000/videoq-jobs",
    )
    assert sqs_endpoint_url() == "http://127.0.0.1:9324"


def test_sqs_endpoint_none_for_real_aws(monkeypatch) -> None:
    monkeypatch.delenv("AWS_ENDPOINT_URL", raising=False)
    monkeypatch.delenv("SQS_ENDPOINT_URL", raising=False)
    monkeypatch.setenv(
        "SQS_QUEUE_URL",
        "https://sqs.ap-northeast-1.amazonaws.com/123/videoq",
    )
    assert sqs_endpoint_url() is None
