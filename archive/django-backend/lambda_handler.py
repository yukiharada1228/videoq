"""
Deprecated shim — deploy worker-python/handler.handler instead.

Re-exports the Django-free worker handler from worker_python. The legacy
backend/ tree is no longer required at runtime once worker-python is installed.
"""

from worker_python.lambda_handler import _execute_task, handler

__all__ = ["handler", "_execute_task"]
