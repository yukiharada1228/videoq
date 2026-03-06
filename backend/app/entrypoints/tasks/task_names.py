"""Celery task names shared across entrypoints and infrastructure."""

# Official task names (single source of truth).
TRANSCRIBE_VIDEO_TASK = "app.entrypoints.tasks.transcription.transcribe_video"
DELETE_ACCOUNT_DATA_TASK = "app.entrypoints.tasks.account_deletion.delete_account_data"
REINDEX_ALL_VIDEOS_EMBEDDINGS_TASK = (
    "app.entrypoints.tasks.reindexing.reindex_all_videos_embeddings"
)
