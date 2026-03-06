"""Backward-compatible wrapper for transcription Celery entrypoint."""

from app.entrypoints.tasks.transcription import transcribe_video

__all__ = ["transcribe_video"]
