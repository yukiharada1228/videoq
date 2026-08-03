"""
Celery task name contracts (mirrors archive/django-backend app/contracts/tasks.py).

These strings are SQS routing identifiers and must stay identical.
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
REINDEX_VIDEO_TRANSCRIPT_TASK = (
    "app.entrypoints.tasks.reindex_video_transcript.reindex_video_transcript"
)
BUILD_PLOG_TASK = "app.entrypoints.tasks.build_plog.build_plog_artifacts"
