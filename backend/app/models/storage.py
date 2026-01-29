import os
import time

from django.core.files.storage import FileSystemStorage
from storages.backends.s3boto3 import S3Boto3Storage


class SafeFilenameMixin:
    """
    Mixin class that provides safe filename handling with timestamp-based conversion
    """

    def get_available_name(self, name, max_length=None):
        """
        Convert filename to safe format and avoid duplicates
        """
        # Convert absolute path to relative path
        if os.path.isabs(name):
            name = os.path.basename(name)

        # Split into directory and filename parts
        dir_name = os.path.dirname(name)
        base_name = os.path.basename(name)
        safe_base_name = self._get_safe_filename(base_name)
        # Join if directory exists, otherwise filename only
        safe_name = (
            os.path.join(dir_name, safe_base_name) if dir_name else safe_base_name
        )

        # Call original get_available_name method for duplicate check
        return super().get_available_name(safe_name, max_length)

    def _get_safe_filename(self, filename):
        """
        Convert filename to timestamp-based safe format
        """
        # Get file extension
        _, ext = os.path.splitext(filename)

        # Generate timestamp-based filename
        timestamp = int(time.time() * 1000)  # Timestamp in milliseconds

        # Generate safe filename
        safe_name = f"video_{timestamp}{ext}"

        return safe_name


class SafeFileSystemStorage(SafeFilenameMixin, FileSystemStorage):
    """
    Safe file storage for local use with timestamp-based filename conversion
    """

    pass


class SafeS3Boto3Storage(SafeFilenameMixin, S3Boto3Storage):
    """
    Custom S3 storage with safe processing and timestamp-based filename conversion
    """

    def _normalize_name(self, name):
        """
        Normalize filename for S3 (handle Windows paths and ensure proper S3 key format)
        """
        # Normalize slashes (Windows backslash to Unix slash)
        name = name.replace("\\", "/")

        # Remove leading slash (S3 object keys should not start with /)
        if name.startswith("/"):
            name = name[1:]

        # Call parent's _normalize_name to apply location prefix
        return super()._normalize_name(name)


def get_default_storage():
    """
    Get default storage based on settings.
    Uses Django's default_storage which is configured via STORAGES setting.
    """
    from django.core.files.storage import default_storage

    return default_storage
