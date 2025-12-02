"""
Celery tasks package for video transcription
"""

from app.tasks.transcription import transcribe_video

__all__ = ["transcribe_video"]
