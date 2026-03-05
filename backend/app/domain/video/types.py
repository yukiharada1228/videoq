"""
Domain-level type protocols for the video domain.
No Django / ORM / external service dependencies.
"""

from typing import Protocol, runtime_checkable


@runtime_checkable
class UploadedFileLike(Protocol):
    """Minimal interface for an uploaded file object."""

    name: str
    size: int

    def read(self, size: int = -1) -> bytes: ...

    def chunks(self): ...
