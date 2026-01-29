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
        Generate a timestamp-based safe filename, preserve any directory path, and delegate duplicate resolution to the parent storage.
        
        Parameters:
            name (str): Original filename or path. Absolute paths are reduced to the basename.
            max_length (int | None): Optional maximum length for the resulting name; passed through to the parent implementation.
        
        Returns:
            available_name (str): A safe filename in the form `video_<timestamp><extension>` (preserving the original directory if present), potentially modified by the parent storage to avoid naming collisions.
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
        Generate a timestamp-based safe filename preserving the original file extension.
        
        Parameters:
            filename (str): Original filename from which the file extension will be preserved.
        
        Returns:
            str: A new filename in the format "video_<timestamp><extension>" where <timestamp> is the current time in milliseconds since the epoch and <extension> is the original file's extension (including the leading dot, if any).
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
        Normalize a storage name for S3 by converting backslashes to forward slashes and removing a leading slash.
        
        Parameters:
            name (str): The file path or key to normalize; may contain Windows-style backslashes or a leading slash.
        
        Returns:
            str: The normalized storage key with forward slashes and no leading slash, after parent normalization is applied.
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
    Retrieve the project's configured default file storage backend.
    
    This is the storage instance configured via Django's STORAGES setting (django.core.files.storage.default_storage).
    
    Returns:
        The configured storage backend instance.
    """
    from django.core.files.storage import default_storage

    return default_storage