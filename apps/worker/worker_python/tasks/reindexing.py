"""reindex_all_videos_embeddings — full embedding rebuild."""

from __future__ import annotations

import logging
from collections.abc import Iterable
from itertools import chain

from worker_python.advisory_locks import full_vector_write_lock
from worker_python.pipeline import vector_index
from worker_python.pipeline.embeddings import embed_texts
from worker_python.video_sql import VideoRow, stream_completed_videos_with_transcript

logger = logging.getLogger(__name__)


class ReindexingIncompleteError(RuntimeError):
    """At least one video failed; retry the SQS job instead of losing the failure."""


def reindex_all_videos_embeddings() -> dict:
    """Regenerate embedding vectors for all completed videos."""
    logger.info("Re-indexing task started")

    with full_vector_write_lock() as lock_conn:
        with stream_completed_videos_with_transcript(lock_conn) as videos:
            return _run_reindex(videos)


def _run_reindex(videos: Iterable[VideoRow]) -> dict:
    """Run while the caller holds the global PostgreSQL advisory lock."""

    remaining = iter(videos)
    first = next(remaining, None)
    if first is None:
        result = {
            "status": "completed",
            "total_videos": 0,
            "successful_count": 0,
            "failed_count": 0,
            "message": "No videos to re-index",
        }
        logger.info("Re-indexing completed: %s", result["message"])
        return result

    vector_index.check_embedding_storage()
    embed_texts(["VideoQ embedding preflight"])
    deleted_count = vector_index.delete_all_vectors()
    logger.info("Deleted %d vectors", deleted_count)

    successful_count = 0
    failed_count = 0

    for total, video in enumerate(chain((first,), remaining), start=1):
        try:
            # The global write lock excludes other writers after delete_all_vectors.
            vector_index.index_video_transcript(video, replace_existing=False)
            successful_count += 1
            logger.info(
                "[%d] Re-indexed video %d (%s)", total, video.id, video.title
            )
        except Exception:
            logger.exception("Failed to re-index video %d", video.id)
            failed_count += 1

    message = f"Re-indexed {successful_count}/{total} videos"
    logger.info("Re-indexing completed: %s", message)

    if failed_count:
        raise ReindexingIncompleteError(f"{message}; {failed_count} video(s) failed")

    return {
        "status": "completed",
        "total_videos": total,
        "successful_count": successful_count,
        "failed_count": 0,
        "failed_videos": [],
        "message": message,
    }
