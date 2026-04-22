"""
Celery task name contracts.

Single source of truth for logical task names shared between:
- entrypoints (task registration via @shared_task(name=...))
- infrastructure (task dispatch via send_task(...))

These strings are Celery's task routing identifiers and must match
the fully-qualified Python path where each @shared_task is defined.
"""

TRANSCRIBE_VIDEO_TASK = "app.entrypoints.tasks.transcription.transcribe_video"
DELETE_ACCOUNT_DATA_TASK = "app.entrypoints.tasks.account_deletion.delete_account_data"
REINDEX_ALL_VIDEOS_EMBEDDINGS_TASK = (
    "app.entrypoints.tasks.reindexing.reindex_all_videos_embeddings"
)
INDEX_VIDEO_TRANSCRIPT_TASK = (
    "app.entrypoints.tasks.indexing.index_video_transcript"
)
EVALUATE_CHAT_LOG_TASK = "app.entrypoints.tasks.evaluation.evaluate_chat_log"
