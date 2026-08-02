"""
Top-level Lambda entry point for worker-python deployments.

Configure Lambda handler as: handler.handler
"""

from worker_python.lambda_handler import handler

__all__ = ["handler"]
