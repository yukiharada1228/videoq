"""Download / delete media objects (local MEDIA_ROOT or S3/R2/Garage)."""

from __future__ import annotations

import logging
import os
import shutil
import tempfile
from contextlib import closing
from pathlib import Path

from worker_python.env import credential_pair, env_flag, env_str

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
        or ("auto" if endpoint else None)
    )
    kwargs: dict = {
        "config": Config(signature_version="s3v4"),
    }
    if region:
        kwargs["region_name"] = region
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    # Storage-specific credentials are a pair. Otherwise let boto3 resolve AWS
    # credentials, including session tokens and refreshable role credentials.
    for prefix in ("R2", "AWS_S3"):
        pair = credential_pair(os.environ, prefix)
        if pair:
            kwargs["aws_access_key_id"], kwargs["aws_secret_access_key"] = pair
            break
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
        bucket = _bucket()
        key = object_storage_key(file_key)
        logger.info("Downloading s3://%s/%s → %s", bucket, key, dest)
        with closing(_s3_client()) as client:
            client.download_file(bucket, key, str(dest))
        return dest

    src = resolve_local_media_path(file_key)
    if src.resolve() != dest.resolve():
        shutil.copyfile(src, dest)
    return dest


def upload_bytes(file_key: str, payload: bytes, content_type: str) -> None:
    """Atomic publication of a bounded derived object."""
    if _use_object_storage():
        with closing(_s3_client()) as client:
            client.put_object(
                Bucket=_bucket(), Key=object_storage_key(file_key),
                Body=payload, ContentType=content_type,
            )
        return
    path = Path(env_str("MEDIA_ROOT", "/tmp/videoq-media")) / file_key.lstrip("/")
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as tmp:
        temporary = Path(tmp.name)
        try:
            tmp.write(payload)
            tmp.flush()
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def upload_file(file_key: str, source: Path, content_type: str) -> None:
    """Stream a derived file through one atomic PUT, without loading it into RAM."""
    if _use_object_storage():
        with closing(_s3_client()) as client, source.open("rb") as body:
            client.put_object(
                Bucket=_bucket(), Key=object_storage_key(file_key), Body=body,
                ContentLength=source.stat().st_size, ContentType=content_type,
            )
        return
    path = Path(env_str("MEDIA_ROOT", "/tmp/videoq-media")) / file_key.lstrip("/")
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as tmp:
        temporary = Path(tmp.name)
        try:
            with source.open("rb") as body:
                shutil.copyfileobj(body, tmp, length=1024 * 1024)
            tmp.flush()
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def delete_object(file_key: str) -> None:
    """Delete media; propagate failures so the deletion job can retry."""
    if not file_key:
        return
    if _use_object_storage():
        bucket = _bucket()
        key = object_storage_key(file_key)
        logger.info("Deleting s3://%s/%s", bucket, key)
        with closing(_s3_client()) as client:
            client.delete_object(Bucket=bucket, Key=key)
        return

    path = Path(env_str("MEDIA_ROOT", "/tmp/videoq-media")) / file_key.lstrip("/")
    path.unlink(missing_ok=True)
    logger.info("Deleted local media %s", path)
