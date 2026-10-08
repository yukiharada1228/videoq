"""Exercise the real worker storage adapter against local Garage without AI calls."""

import hashlib
import tempfile
import uuid
from contextlib import closing
from pathlib import Path
from urllib.parse import urlparse

from worker_python.pipeline.storage import (
    _bucket, _s3_client, delete_object, download_to_path, object_storage_key,
    upload_bytes, upload_file,
)


def main():
    with closing(_s3_client()) as client:
        endpoint = urlparse(client.meta.endpoint_url)
        if endpoint.scheme != "http" or endpoint.hostname not in {"garage", "localhost", "127.0.0.1"}:
            raise RuntimeError("This check is restricted to local Garage")
        if client.meta.region_name != "garage":
            raise RuntimeError("Expected Garage's local S3 region")

        prefix = f"garage-smoke/{uuid.uuid4()}"
        small, large = f"{prefix}/metadata.json", f"{prefix}/frames.pack"
        try:
            upload_bytes(small, b'{"storage":"garage"}', "application/json")
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source, result = root / "source", root / "download"
                # Larger than boto3's default multipart-download threshold.
                source.write_bytes(bytes(range(256)) * (40 * 1024))
                upload_file(large, source, "application/octet-stream")
                download_to_path(large, result)
                with source.open("rb") as source_file, result.open("rb") as result_file:
                    if hashlib.file_digest(source_file, "sha256").digest() != hashlib.file_digest(result_file, "sha256").digest():
                        raise RuntimeError("Worker download content mismatch")
                download_to_path(small, result)
                if result.read_bytes() != b'{"storage":"garage"}':
                    raise RuntimeError("Worker byte upload content mismatch")
                metadata = client.head_object(Bucket=_bucket(), Key=object_storage_key(small))
                if metadata["ContentType"] != "application/json":
                    raise RuntimeError("Worker upload content type mismatch")
        finally:
            delete_object(small)
            delete_object(large)
        remaining = client.list_objects_v2(Bucket=_bucket(), Prefix=object_storage_key(prefix))
        if remaining.get("KeyCount"):
            raise RuntimeError("Worker deletion failed")
    print("Worker Garage checks passed: byte/file uploads, 10 MiB download, metadata, deletion.")


if __name__ == "__main__":
    main()
