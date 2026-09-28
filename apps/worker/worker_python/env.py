"""Environment helpers shared across pipeline modules."""

from __future__ import annotations

import os
from collections.abc import Mapping


def env_flag(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_str(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def credential_pair(values: Mapping[str, object], prefix: str) -> tuple[str, str] | None:
    """Select both keys from one source; never fill a partial pair from another."""
    names = (f"{prefix}_ACCESS_KEY_ID", f"{prefix}_SECRET_ACCESS_KEY")
    raw = tuple(values.get(name) for name in names)
    error = f"{names[0]} and {names[1]} must be non-empty strings set together"
    if any(value is not None and not isinstance(value, str) for value in raw):
        raise ValueError(error)
    access_key, secret_key = (value.strip() if isinstance(value, str) else "" for value in raw)
    if not access_key and not secret_key:
        return None
    if not access_key or not secret_key:
        raise ValueError(error)
    return access_key, secret_key


def heavy_pipeline_enabled() -> bool:
    return env_flag("ENABLE_HEAVY_PIPELINE", False)
