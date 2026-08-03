"""
Deprecated shim — deploy apps/worker with handler ``handler.handler``.

Re-exports the Django-free worker handler from worker_python.
"""

from worker_python.lambda_handler import _execute_task, handler

__all__ = ["handler", "_execute_task"]
