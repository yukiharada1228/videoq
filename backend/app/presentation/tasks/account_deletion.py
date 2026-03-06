"""Backward-compatible wrapper for account deletion Celery entrypoint."""

from app.entrypoints.tasks.account_deletion import delete_account_data

__all__ = ["delete_account_data"]
