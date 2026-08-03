"""Environment helpers shared across pipeline modules."""

from __future__ import annotations

import os


def env_flag(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_str(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def heavy_pipeline_enabled() -> bool:
    return env_flag("ENABLE_HEAVY_PIPELINE", False)
