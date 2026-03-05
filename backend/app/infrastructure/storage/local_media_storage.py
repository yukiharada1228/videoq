"""
Local filesystem implementation of MediaStorageGateway.
"""

import os

from django.conf import settings

from app.domain.media.ports import MediaStorageGateway


class LocalMediaStorage(MediaStorageGateway):
    """Media storage backed by Django MEDIA_ROOT."""

    def _full_path(self, path: str) -> str:
        return os.path.join(settings.MEDIA_ROOT, path)

    def exists(self, path: str) -> bool:
        return os.path.exists(self._full_path(path))

    def open(self, path: str, mode: str = "rb"):
        return open(self._full_path(path), mode)
