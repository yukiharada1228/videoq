"""Download / delete media objects (local MEDIA_ROOT or S3/R2/MinIO)."""

from __future__ import annotations

import logging
from pathlib import Path

from worker_python.env import env_flag, env_str

logger = logging.getLogger(__name__)


def _use_object_storage() -> bool:
    return env_flag("USE_S3_STORAGE", False)


def object_storage_key(file_key: str) -> str:
    """DB `file` 値 → S3 キー（django-storages location=\"media\" / Hono と同じ）。"""
    normalized = file_key.replace("\\", "/").lstrip("/")
    if normalized.startswith("media/"):
        return normalized
    return f"media/{normalized}"


def _s3_client():
    import boto3

    endpoint = env_str("AWS_S3_ENDPOINT_URL") or env_str("AWS_S3_ENDPOINT") or None
    region = env_str("AWS_S3_REGION_NAME") or env_str("AWS_REGION") or "auto"
    kwargs: dict = {"region_name": region}
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    return boto3.client("s3", **kwargs)


def _bucket() -> str:
    name = env_str("AWS_STORAGE_BUCKET_NAME") or env_str("R2_BUCKET_NAME")
    if not name:
        raise RuntimeError("AWS_STORAGE_BUCKET_NAME (or R2_BUCKET_NAME) is required")
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
