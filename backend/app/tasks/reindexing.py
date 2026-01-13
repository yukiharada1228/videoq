"""
Re-indexing task for regenerating embedding vectors
"""

import logging

from celery import shared_task

from app.models import Video
from app.tasks.vector_indexing import index_scenes_batch
from app.utils.vector_manager import delete_all_vectors

logger = logging.getLogger(__name__)


@shared_task(bind=True)
def reindex_all_videos_embeddings(self):
    """
    Regenerate embedding vectors for all videos
    Used when switching embedding models (EMBEDDING_PROVIDER/EMBEDDING_MODEL)

    Returns:
        dict: Result containing status, counts, and error information
    """
    try:
        # 1. Get completed videos with transcripts
        videos = (
            Video.objects.filter(status="completed")
            .exclude(transcript__isnull=True)
            .exclude(transcript="")
            .select_related("user")
        )

        total = videos.count()
        logger.info(f"Starting re-indexing: {total} videos")

        if total == 0:
            return {
                "status": "completed",
                "total_videos": 0,
                "successful_count": 0,
                "failed_count": 0,
                "message": "No videos to re-index",
            }

        # 2. Delete all existing vectors
        logger.info("Deleting all existing vectors...")
        deleted_count = delete_all_vectors()
        logger.info(f"Deleted {deleted_count} vectors")

        # 3. Re-index each video
        successful_count = 0
        failed_videos = []

        for index, video in enumerate(videos, start=1):
            try:
                # Re-index scenes (uses OPENAI_API_KEY environment variable)
                index_scenes_batch(video.transcript, video)
                successful_count += 1

                logger.info(
                    f"[{index}/{total}] Successfully re-indexed video {video.id} ({video.title})"
                )

            except Exception as e:
                logger.error(
                    f"Failed to re-index video {video.id}: {str(e)}", exc_info=True
                )
                failed_videos.append(
                    {"video_id": video.id, "title": video.title, "error": str(e)}
                )

        # 4. Return result
        result = {
            "status": "completed",
            "total_videos": total,
            "successful_count": successful_count,
            "failed_count": len(failed_videos),
            "failed_videos": failed_videos,
            "message": f"Re-indexed {successful_count}/{total} videos",
        }

        logger.info(f"Re-indexing completed: {result['message']}")
        return result

    except Exception as e:
        logger.error(f"Re-indexing task failed: {str(e)}", exc_info=True)
        return {
            "status": "failed",
            "error": str(e),
            "message": "Re-indexing task encountered an error",
        }
