"""
Local filesystem implementation of MediaStorageGateway.
"""

import os
from pathlib import Path

from django.conf import settings

from app.domain.media.ports import MediaStorageGateway


class LocalMediaStorage(MediaStorageGateway):
    """Media storage backed by Django MEDIA_ROOT."""

    def _full_path(self, path: str) -> str:
        if os.path.isabs(path):
            raise ValueError(f"Absolute path not allowed: {path!r}")
        parts = Path(path).parts
        if ".." in parts:
            raise ValueError(f"Path traversal not allowed: {path!r}")
        media_root = Path(settings.MEDIA_ROOT).resolve()
        full = (media_root / path).resolve()
        if not full.is_relative_to(media_root):
            raise ValueError(f"Path escapes MEDIA_ROOT: {path!r}")
        return str(full)

    def exists(self, path: str) -> bool:
        return os.path.exists(self._full_path(path))

    def open(self, path: str, mode: str = "rb"):
        return open(self._full_path(path), mode)
