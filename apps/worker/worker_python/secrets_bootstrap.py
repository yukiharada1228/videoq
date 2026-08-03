"""Load Secrets Manager payloads into process env for Lambda.

Lambda forbids configuring reserved keys like AWS_ACCESS_KEY_ID on the
function configuration, so R2 credentials are injected at runtime from
APP_SECRET_ARN instead.
"""

from __future__ import annotations

import json
import logging
import os

logger = logging.getLogger(__name__)

_LOADED = False

# app secret key → process env (skip if already set)
_APP_ENV_MAP = {
    "OPENAI_API_KEY": "OPENAI_API_KEY",
    "USER_SECRET_ENCRYPTION_KEY": "USER_SECRET_ENCRYPTION_KEY",
    "AWS_ACCESS_KEY_ID": "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY": "AWS_SECRET_ACCESS_KEY",
    "AWS_STORAGE_BUCKET_NAME": "AWS_STORAGE_BUCKET_NAME",
    "AWS_S3_ENDPOINT_URL": "AWS_S3_ENDPOINT_URL",
    "AWS_S3_REGION_NAME": "AWS_S3_REGION_NAME",
}


def ensure_secrets_loaded() -> None:
    global _LOADED
    if _LOADED:
        return
    _LOADED = True

    db_arn = os.environ.get("DB_SECRET_ARN", "").strip()
    app_arn = os.environ.get("APP_SECRET_ARN", "").strip()
    if not db_arn and not app_arn:
        return

    try:
        import boto3
    except ImportError:
        logger.warning("boto3 unavailable; skipping secrets bootstrap")
        return

    client = boto3.client("secretsmanager")

    if db_arn and not os.environ.get("DATABASE_URL"):
        payload = _get_json_secret(client, db_arn)
        url = (payload.get("DATABASE_URL") or "").strip()
        if url:
            os.environ["DATABASE_URL"] = url
            logger.info("Loaded DATABASE_URL from DB_SECRET_ARN")

    if app_arn:
        payload = _get_json_secret(client, app_arn)
        for src, dest in _APP_ENV_MAP.items():
            if os.environ.get(dest):
                continue
            value = payload.get(src)
            if isinstance(value, str) and value.strip():
                os.environ[dest] = value.strip()
        logger.info("Loaded app secrets from APP_SECRET_ARN")


def _get_json_secret(client: object, arn: str) -> dict:
    response = client.get_secret_value(SecretId=arn)  # type: ignore[attr-defined]
    raw = response.get("SecretString") or ""
    if not raw:
        return {}
    data = json.loads(raw)
    return data if isinstance(data, dict) else {}
