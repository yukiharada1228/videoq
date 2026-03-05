"""Backward-compatible re-export for presentation view mixins.

New code should import from app.presentation.common.mixins.
"""

from importlib import import_module

__all__ = ["AuthenticatedViewMixin", "PublicViewMixin", "DynamicSerializerMixin"]


def __getattr__(name):
    if name in __all__:
        module = import_module("app.presentation.common.mixins")
        return getattr(module, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
