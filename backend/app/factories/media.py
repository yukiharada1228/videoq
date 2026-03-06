"""Media factory wrappers kept for backward compatibility."""

from app import composition_root


def get_resolve_protected_media_use_case():
    return composition_root.get_resolve_protected_media_use_case()
