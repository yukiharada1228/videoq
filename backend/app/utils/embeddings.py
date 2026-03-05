"""Backward-compatible re-export for embedding provider factory.

New code should import from app.infrastructure.common.embeddings.
"""

from importlib import import_module
from typing import Optional


def get_embeddings(api_key: Optional[str] = None):
    module = import_module("app.infrastructure.common.embeddings")
    return module.get_embeddings(api_key)


__all__ = ["get_embeddings"]
