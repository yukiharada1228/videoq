"""
Deprecated path for old Lambda image configs.

Prefer deploying ``worker-python`` with handler ``handler.handler``.
This shim adds the sibling package to ``sys.path`` and re-exports the
django-free handler.
"""

from __future__ import annotations

import sys
from pathlib import Path

_root = Path(__file__).resolve().parents[1]
_worker = _root / "worker-python"
if str(_worker) not in sys.path:
    sys.path.insert(0, str(_worker))

from worker_python.lambda_handler import _execute_task, handler  # noqa: E402

__all__ = ["handler", "_execute_task"]
