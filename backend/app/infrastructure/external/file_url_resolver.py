"""
Infrastructure implementation of the FileUrlResolver port.
"""

from typing import Optional

from app.domain.video.ports import FileUrlResolver


class DjangoFileUrlResolver(FileUrlResolver):
    """Resolves storage file keys to URLs using Django's default storage backend."""

    def resolve(self, file_key: str) -> Optional[str]:
        from django.core.files.storage import default_storage
        try:
            return default_storage.url(file_key)
        except Exception:
            return None
