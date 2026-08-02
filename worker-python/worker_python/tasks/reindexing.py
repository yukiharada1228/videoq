"""reindex_all_videos_embeddings — full embedding rebuild."""

from __future__ import annotations

import logging

from worker_python.db import db_connection
from worker_python.video_sql import (
    list_completed_videos_with_transcript,
    stub_delete_all_vectors,
    stub_vector_index,
)

logger = logging.getLogger(__name__)


def reindex_all_videos_embeddings() -> dict:
    """Regenerate embedding vectors for all completed videos."""
    logger.info("Re-indexing task started")

    with db_connection() as conn:
        videos = list_completed_videos_with_transcript(conn)

    total = len(videos)
    logger.info("Starting re-indexing: %d videos", total)

    if total == 0:
        result = {
            "status": "completed",
            "total_videos": 0,
            "successful_count": 0,
            "failed_count": 0,
            "message": "No videos to re-index",
        }
        logger.info("Re-indexing completed: %s", result["message"])
        return result

    deleted_count = stub_delete_all_vectors()
    logger.info("Deleted %d vectors (stub)", deleted_count)

    successful_count = 0
    failed_videos: list[dict] = []

    for index, video in enumerate(videos, start=1):
        try:
            if not video.transcript:
                raise ValueError("Transcript is missing")
            stub_vector_index(
                video.id, video.user_id, video.title, video.transcript
            )
            successful_count += 1
            logger.info(
                "[%d/%d] Re-indexed video %d (%s)", index, total, video.id, video.title
            )
        except Exception as exc:
            logger.exception("Failed to re-index video %d", video.id)
            failed_videos.append(
                {"video_id": video.id, "title": video.title, "error": str(exc)}
            )

    message = f"Re-indexed {successful_count}/{total} videos"
    logger.info("Re-indexing completed: %s", message)

    return {
        "status": "completed",
        "total_videos": total,
        "successful_count": successful_count,
        "failed_count": len(failed_videos),
        "failed_videos": failed_videos,
        "message": message,
    }
