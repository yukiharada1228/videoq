"""Task registry: native job type → callable."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from worker_python.contracts import (
    JOB_BUILD_PLOG,
    JOB_DELETE_ACCOUNT_DATA,
    JOB_EVALUATE_CHAT_LOG,
    JOB_INDEX_VIDEO_TRANSCRIPT,
    JOB_REINDEX_ALL_VIDEOS_EMBEDDINGS,
    JOB_REINDEX_VIDEO_TRANSCRIPT,
    JOB_TRANSCRIBE_VIDEO,
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
    JOB_TRANSCRIBE_VIDEO: transcribe_video,
    JOB_DELETE_ACCOUNT_DATA: delete_account_data,
    JOB_REINDEX_ALL_VIDEOS_EMBEDDINGS: reindex_all_videos_embeddings,
    JOB_INDEX_VIDEO_TRANSCRIPT: index_video_transcript,
    JOB_EVALUATE_CHAT_LOG: evaluate_chat_log,
    JOB_REINDEX_VIDEO_TRANSCRIPT: reindex_video_transcript,
    JOB_BUILD_PLOG: build_plog_artifacts,
}


def get_task(name: str) -> TaskFn:
    try:
        return TASK_REGISTRY[name]
    except KeyError as exc:
        raise KeyError(f"Task not registered: {name}") from exc
