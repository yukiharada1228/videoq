"""Load Secrets Manager payloads into process env for Lambda.

Lambda injects reserved AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY for the
execution role. R2 credentials must therefore live under R2_* names in
APP_SECRET_ARN and are loaded into R2_* process env vars.
"""

from __future__ import annotations

import json
import logging
import os

logger = logging.getLogger(__name__)

_LOADED = False

# Canonical app-secret key → process env (skip if already set).
_APP_ENV_MAP = {
    "OPENAI_API_KEY": "OPENAI_API_KEY",
    "USER_SECRET_ENCRYPTION_KEY": "USER_SECRET_ENCRYPTION_KEY",
    "R2_ACCESS_KEY_ID": "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY": "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME": "R2_BUCKET_NAME",
    "R2_S3_ENDPOINT": "R2_S3_ENDPOINT",
    "R2_S3_REGION": "R2_S3_REGION",
    # Legacy aliases (pre-R2_* rename). Prefer canonical keys above.
    "AWS_STORAGE_BUCKET_NAME": "R2_BUCKET_NAME",
    "AWS_S3_ENDPOINT_URL": "R2_S3_ENDPOINT",
    "AWS_S3_REGION_NAME": "R2_S3_REGION",
    "AWS_ACCESS_KEY_ID": "R2_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY": "R2_SECRET_ACCESS_KEY",
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
        # Prefer canonical R2_* secret keys over legacy AWS_* aliases when both exist.
        for src, dest in _APP_ENV_MAP.items():
            if os.environ.get(dest):
                continue
            value = payload.get(src)
            if isinstance(value, str) and value.strip():
                os.environ[dest] = value.strip()
        # Keep legacy env names some callers still read.
        _mirror_if_missing("R2_BUCKET_NAME", "AWS_STORAGE_BUCKET_NAME")
        _mirror_if_missing("R2_S3_ENDPOINT", "AWS_S3_ENDPOINT_URL")
        _mirror_if_missing("R2_S3_REGION", "AWS_S3_REGION_NAME")
        logger.info("Loaded app secrets from APP_SECRET_ARN")


def _mirror_if_missing(src: str, dest: str) -> None:
    if os.environ.get(dest):
        return
    value = os.environ.get(src, "").strip()
    if value:
        os.environ[dest] = value


def _get_json_secret(client: object, arn: str) -> dict:
    response = client.get_secret_value(SecretId=arn)  # type: ignore[attr-defined]
    raw = response.get("SecretString") or ""
    if not raw:
        return {}
    data = json.loads(raw)
    return data if isinstance(data, dict) else {}
