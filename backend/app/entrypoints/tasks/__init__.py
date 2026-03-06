"""Celery task entrypoints."""

from app.entrypoints.tasks.account_deletion import delete_account_data
from app.entrypoints.tasks.indexing import index_video_transcript_task
from app.entrypoints.tasks.reindexing import reindex_all_videos_embeddings
from app.entrypoints.tasks.transcription import transcribe_video

__all__ = [
    "delete_account_data",
    "index_video_transcript_task",
    "reindex_all_videos_embeddings",
    "transcribe_video",
]
