"""
Domain-level type protocols for the video domain.
No Django / ORM / external service dependencies.
"""

from typing import Protocol, runtime_checkable


@runtime_checkable
class BinarySource(Protocol):
    """Minimal interface for a readable binary source."""

    name: str

    def read(self, size: int = -1) -> bytes: ...
