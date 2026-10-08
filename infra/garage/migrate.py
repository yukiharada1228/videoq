"""Copy local MinIO objects to Garage, preserving metadata and verifying SHA-256.

Stop the local API and worker before running. Existing different destination
objects cause failure; source objects are never modified or deleted.
"""

import hashlib
import os
import tempfile
from contextlib import ExitStack, closing

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

METADATA_FIELDS = (
    "ContentType", "CacheControl", "ContentDisposition", "ContentEncoding",
    "ContentLanguage", "Expires", "Metadata",
)


def inventory(client, bucket):
    return {
        obj["Key"]: (obj["Size"], obj["ETag"])
        for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket)
        for obj in page.get("Contents", [])
    }


def digest(body):
    result = hashlib.sha256()
    with closing(body):
        for chunk in iter(lambda: body.read(1024 * 1024), b""):
            result.update(chunk)
    return result.digest()


def main():
    config = Config(signature_version="s3v4", connect_timeout=5, read_timeout=60,
                    s3={"addressing_style": "path"})
    with ExitStack() as stack:
        source = stack.enter_context(closing(boto3.client(
            "s3", endpoint_url="http://minio:9000", region_name="us-east-1",
            aws_access_key_id=os.environ["MINIO_ROOT_USER"],
            aws_secret_access_key=os.environ["MINIO_ROOT_PASSWORD"], config=config,
        )))
        target = stack.enter_context(closing(boto3.client(
            "s3", endpoint_url="http://garage:3900", region_name="garage",
            aws_access_key_id=os.environ["GARAGE_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["GARAGE_SECRET_ACCESS_KEY"], config=config,
        )))
        src_bucket, dst_bucket = os.environ["MINIO_BUCKET"], os.environ["GARAGE_BUCKET"]
        objects = inventory(source, src_bucket)
        copied = skipped = total = 0
        for key, (size, etag) in objects.items():
            obj = source.get_object(Bucket=src_bucket, Key=key, IfMatch=etag)
            metadata = {field: obj[field] for field in METADATA_FIELDS if field in obj}
            # Spill large videos to disk instead of holding the whole object in memory.
            with tempfile.TemporaryFile() as file, closing(obj["Body"]) as body:
                hasher = hashlib.sha256()
                for chunk in iter(lambda: body.read(1024 * 1024), b""):
                    file.write(chunk)
                    hasher.update(chunk)
                if file.tell() != size:
                    raise RuntimeError("Source object size changed during migration")
                expected = hasher.digest()
                try:
                    existing = target.get_object(Bucket=dst_bucket, Key=key)
                except ClientError as error:
                    if error.response["ResponseMetadata"]["HTTPStatusCode"] != 404:
                        raise
                    existing = None
                if existing is not None:
                    if digest(existing["Body"]) != expected or any(
                        existing.get(field) != value for field, value in metadata.items()
                    ):
                        raise RuntimeError("Destination contains different data or metadata; refusing to overwrite")
                    skipped += 1
                else:
                    file.seek(0)
                    target.put_object(Bucket=dst_bucket, Key=key, Body=file,
                                      ContentLength=size, IfNoneMatch="*", **metadata)
                    stored = target.get_object(Bucket=dst_bucket, Key=key)
                    if digest(stored["Body"]) != expected or any(
                        stored.get(field) != value for field, value in metadata.items()
                    ):
                        raise RuntimeError("Destination verification failed")
                    copied += 1
                total += size
        if inventory(source, src_bucket) != objects:
            raise RuntimeError("Source changed during migration; stop all writers and retry")
        print(f"Verified {len(objects)} objects / {total} bytes; copied={copied}, already identical={skipped}.")


if __name__ == "__main__":
    main()
