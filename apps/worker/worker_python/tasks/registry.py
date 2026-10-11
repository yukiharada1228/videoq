"""Task registry: native job type → callable."""

from __future__ import annotations

from collections.abc import Callable

from worker_python.contracts import (
    JOB_DELETE_ACCOUNT_DATA,
    JOB_INDEX_VIDEO_TRANSCRIPT,
    JOB_REINDEX_ALL_VIDEOS_EMBEDDINGS,
    JOB_REINDEX_VIDEO_TRANSCRIPT,
    JOB_TRANSCRIBE_VIDEO,
    JOB_TRANSCRIBE_VIDEO_CHUNK,
    JOB_FINISH_VIDEO_TRANSCRIPTION,
    JOB_BUILD_VIDEO_VISUALS,
)
from worker_python.tasks.account_deletion import delete_account_data
from worker_python.tasks.indexing import index_video_transcript
from worker_python.tasks.reindex_video_transcript import reindex_video_transcript
from worker_python.tasks.reindexing import reindex_all_videos_embeddings
from worker_python.tasks.transcription import transcribe_video
from worker_python.tasks.segmented_transcription import (
    transcribe_video_chunk, finish_video_transcription, build_video_visuals,
)

TaskFn = Callable[..., None]

TASK_REGISTRY: dict[str, TaskFn] = {
    JOB_TRANSCRIBE_VIDEO: transcribe_video,
    JOB_TRANSCRIBE_VIDEO_CHUNK: transcribe_video_chunk,
    JOB_FINISH_VIDEO_TRANSCRIPTION: finish_video_transcription,
    JOB_BUILD_VIDEO_VISUALS: build_video_visuals,
    JOB_DELETE_ACCOUNT_DATA: delete_account_data,
    JOB_REINDEX_ALL_VIDEOS_EMBEDDINGS: reindex_all_videos_embeddings,
    JOB_INDEX_VIDEO_TRANSCRIPT: index_video_transcript,
    JOB_REINDEX_VIDEO_TRANSCRIPT: reindex_video_transcript,
}


def get_task(name: str) -> TaskFn:
    try:
        return TASK_REGISTRY[name]
    except KeyError as exc:
        raise KeyError(f"Task not registered: {name}") from exc
