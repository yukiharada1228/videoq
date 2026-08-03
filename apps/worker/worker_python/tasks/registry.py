"""Task registry: Celery task name → callable."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from worker_python.contracts import (
    BUILD_PLOG_TASK,
    DELETE_ACCOUNT_DATA_TASK,
    EVALUATE_CHAT_LOG_TASK,
    INDEX_VIDEO_TRANSCRIPT_TASK,
    REINDEX_ALL_VIDEOS_EMBEDDINGS_TASK,
    REINDEX_VIDEO_TRANSCRIPT_TASK,
    TRANSCRIBE_VIDEO_TASK,
)
from worker_python.tasks.account_deletion import delete_account_data
from worker_python.tasks.build_plog import build_plog_artifacts
from worker_python.tasks.evaluation import evaluate_chat_log
from worker_python.tasks.indexing import index_video_transcript
from worker_python.tasks.reindex_video_transcript import reindex_video_transcript
from worker_python.tasks.reindexing import reindex_all_videos_embeddings
from worker_python.tasks.transcription import transcribe_video

TaskFn = Callable[..., Any]

TASK_REGISTRY: dict[str, TaskFn] = {
    TRANSCRIBE_VIDEO_TASK: transcribe_video,
    DELETE_ACCOUNT_DATA_TASK: delete_account_data,
    REINDEX_ALL_VIDEOS_EMBEDDINGS_TASK: reindex_all_videos_embeddings,
    INDEX_VIDEO_TRANSCRIPT_TASK: index_video_transcript,
    EVALUATE_CHAT_LOG_TASK: evaluate_chat_log,
    REINDEX_VIDEO_TRANSCRIPT_TASK: reindex_video_transcript,
    BUILD_PLOG_TASK: build_plog_artifacts,
}


def get_task(name: str) -> TaskFn:
    try:
        return TASK_REGISTRY[name]
    except KeyError as exc:
        raise KeyError(f"Task not registered: {name}") from exc
