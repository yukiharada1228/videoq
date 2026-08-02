"""Tests for the configured file-upload gateway factory."""

from django.test import SimpleTestCase, override_settings

from app.infrastructure.external.file_upload_gateway import (
    LocalFileUploadGateway,
    R2FileUploadGateway,
    create_file_upload_gateway,
)


class CreateFileUploadGatewayTests(SimpleTestCase):
    @override_settings(USE_S3_STORAGE=False)
    def test_creates_local_gateway_when_object_storage_is_disabled(self):
        self.assertIsInstance(create_file_upload_gateway(), LocalFileUploadGateway)

    @override_settings(USE_S3_STORAGE=True)
    def test_creates_r2_gateway_when_object_storage_is_enabled(self):
        self.assertIsInstance(create_file_upload_gateway(), R2FileUploadGateway)
