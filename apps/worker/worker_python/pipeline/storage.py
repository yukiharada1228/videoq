"""Download / delete media objects (local MEDIA_ROOT or S3/R2/MinIO)."""

from __future__ import annotations

import logging
from pathlib import Path

from worker_python.env import env_flag, env_str

logger = logging.getLogger(__name__)


def _use_object_storage() -> bool:
    return env_flag("USE_S3_STORAGE", False)


def object_storage_key(file_key: str) -> str:
    """modern schema の `videos.file` 値を `media/` 配下の S3 キーへ変換する。"""
    normalized = file_key.replace("\\", "/").lstrip("/")
    if normalized.startswith("media/"):
        return normalized
    return f"media/{normalized}"


def _s3_client():
    import boto3
    from botocore.config import Config

    endpoint = (
        env_str("R2_S3_ENDPOINT")
        or env_str("AWS_S3_ENDPOINT_URL")
        or env_str("AWS_S3_ENDPOINT")
        or None
    )
    region = (
        env_str("R2_S3_REGION")
        or env_str("AWS_S3_REGION_NAME")
        or env_str("AWS_REGION")
        or "auto"
    )
    # Prefer R2_* so Lambda execution-role AWS_ACCESS_KEY_ID is never used against R2.
    access_key = (
        env_str("R2_ACCESS_KEY_ID")
        or env_str("AWS_S3_ACCESS_KEY_ID")
        or env_str("AWS_ACCESS_KEY_ID")
    )
    secret_key = (
        env_str("R2_SECRET_ACCESS_KEY")
        or env_str("AWS_S3_SECRET_ACCESS_KEY")
        or env_str("AWS_SECRET_ACCESS_KEY")
    )
    kwargs: dict = {
        "region_name": region,
        "config": Config(signature_version="s3v4"),
    }
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    if access_key and secret_key:
        kwargs["aws_access_key_id"] = access_key
        kwargs["aws_secret_access_key"] = secret_key
    return boto3.client("s3", **kwargs)


def _bucket() -> str:
    name = env_str("R2_BUCKET_NAME") or env_str("AWS_STORAGE_BUCKET_NAME")
    if not name:
        raise RuntimeError("R2_BUCKET_NAME (or AWS_STORAGE_BUCKET_NAME) is required")
    return name


def resolve_local_media_path(file_key: str) -> Path:
    root = env_str("MEDIA_ROOT", "/tmp/videoq-media")
    path = Path(root) / file_key.lstrip("/")
    if not path.is_file():
        raise FileNotFoundError(f"Media file not found: {path}")
    return path


def download_to_path(file_key: str, dest: Path) -> Path:
    """Materialize an object at dest (downloaded or copied from local media)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    if _use_object_storage():
        client = _s3_client()
        key = object_storage_key(file_key)
        logger.info("Downloading s3://%s/%s → %s", _bucket(), key, dest)
        client.download_file(_bucket(), key, str(dest))
        return dest

    src = resolve_local_media_path(file_key)
    if src.resolve() != dest.resolve():
        dest.write_bytes(src.read_bytes())
    return dest


def delete_object(file_key: str) -> None:
    if not file_key:
        return
    if _use_object_storage():
        client = _s3_client()
        key = object_storage_key(file_key)
        logger.info("Deleting s3://%s/%s", _bucket(), key)
        client.delete_object(Bucket=_bucket(), Key=key)
        return

    path = Path(env_str("MEDIA_ROOT", "/tmp/videoq-media")) / file_key.lstrip("/")
    try:
        path.unlink(missing_ok=True)
        logger.info("Deleted local media %s", path)
    except OSError as exc:
        logger.warning("Failed to delete local media %s: %s", path, exc)


def get_object_size(file_key: str) -> int:
    if _use_object_storage():
        client = _s3_client()
        key = object_storage_key(file_key)
        head = client.head_object(Bucket=_bucket(), Key=key)
        return int(head["ContentLength"])
    return resolve_local_media_path(file_key).stat().st_size
