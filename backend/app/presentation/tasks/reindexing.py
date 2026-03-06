"""Backward-compatible wrapper for reindexing Celery entrypoint."""

from app.entrypoints.tasks.reindexing import reindex_all_videos_embeddings

__all__ = ["reindex_all_videos_embeddings"]
