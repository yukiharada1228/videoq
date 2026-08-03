"""Shared boto3 SQS client (real AWS or local ElasticMQ)."""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlparse


def sqs_endpoint_url() -> str | None:
    """
    Custom endpoint for ElasticMQ / LocalStack.

    Prefer AWS_ENDPOINT_URL / SQS_ENDPOINT_URL. Otherwise, when SQS_QUEUE_URL
    is not on amazonaws.com, use that host (local ElasticMQ).
    """
    explicit = (
        os.environ.get("AWS_ENDPOINT_URL", "").strip()
        or os.environ.get("SQS_ENDPOINT_URL", "").strip()
    )
    if explicit:
        return explicit.rstrip("/")

    queue_url = os.environ.get("SQS_QUEUE_URL", "").strip()
    if not queue_url:
        return None
    if "amazonaws.com" in queue_url:
        return None
    parsed = urlparse(queue_url)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def create_sqs_client() -> Any:
    try:
        import boto3
    except ImportError as exc:
        raise RuntimeError("boto3 is required for SQS") from exc

    region = (
        os.environ.get("AWS_REGION")
        or os.environ.get("AWS_DEFAULT_REGION")
        or "us-east-1"
    )
    kwargs: dict[str, Any] = {"region_name": region}
    endpoint = sqs_endpoint_url()
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    return boto3.client("sqs", **kwargs)
