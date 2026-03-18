"""
Infrastructure implementation of FileUploadGateway using boto3 presigned URLs.
Works with both Cloudflare R2 and AWS S3.
"""

import logging

import boto3
from django.conf import settings

from app.domain.video.gateways import FileUploadGateway

logger = logging.getLogger(__name__)


class R2FileUploadGateway(FileUploadGateway):
    """Generate presigned PUT URLs for direct-to-R2/S3 file uploads."""

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            self._client = boto3.client(
                "s3",
                endpoint_url=getattr(settings, "AWS_S3_ENDPOINT_URL", None),
                aws_access_key_id=getattr(settings, "AWS_ACCESS_KEY_ID", None),
                aws_secret_access_key=getattr(settings, "AWS_SECRET_ACCESS_KEY", None),
                region_name=getattr(settings, "AWS_S3_REGION_NAME", "auto"),
            )
        return self._client

    @staticmethod
    def _get_storage_location() -> str:
        """Read storage location prefix from Django STORAGES config."""
        storages = getattr(settings, "STORAGES", {})
        options = storages.get("default", {}).get("OPTIONS", {})
        return options.get("location", "media")

    def generate_upload_url(self, file_key: str, content_type: str, file_size: int) -> str:
        bucket = getattr(settings, "AWS_STORAGE_BUCKET_NAME", "")
        location = self._get_storage_location()
        s3_key = f"{location}/{file_key}" if location else file_key

        url = self.client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": bucket,
                "Key": s3_key,
                "ContentType": content_type,
                "ContentLength": file_size,
            },
            ExpiresIn=3600,
        )
        logger.info("Generated presigned upload URL for key: %s", s3_key)
        return url
