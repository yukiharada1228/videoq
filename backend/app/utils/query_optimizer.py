"""Backward-compatible re-export for query optimizer utilities.

New code should import from app.infrastructure.common.query_optimizer.
"""

from importlib import import_module

__all__ = ["QueryOptimizer", "BatchProcessor", "CacheOptimizer"]


def __getattr__(name):
    if name in __all__:
        module = import_module("app.infrastructure.common.query_optimizer")
        return getattr(module, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
