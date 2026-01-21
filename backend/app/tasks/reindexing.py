"""
Re-indexing task for regenerating embedding vectors
"""

import logging
from typing import List

from celery import shared_task

from app.models import Video
from app.tasks.vector_indexing import index_scenes_batch
from app.utils.task_helpers import TransactionRollbackManager
from app.utils.vector_manager import PGVectorManager

logger = logging.getLogger(__name__)

# Batch size for re-indexing
REINDEX_BATCH_SIZE = 10


def _backup_video_ids(video_ids: List[int]) -> List[dict]:
    """
    Backup vector metadata for a batch of videos before re-indexing.

    Args:
        video_ids: List of video IDs to backup

    Returns:
        List of backup records containing video_id and document count
    """
    backup_records = []

    try:

        def count_operation(cursor):
            for video_id in video_ids:
                cursor.execute(
                    """
                    SELECT COUNT(*) FROM langchain_pg_embedding
                    WHERE cmetadata->>'video_id' = %s
                    """,
                    (str(video_id),),
                )
                count = cursor.fetchone()[0]
                backup_records.append({"video_id": video_id, "doc_count": count})
            return backup_records

        PGVectorManager.execute_with_connection(count_operation)
    except Exception as e:
        logger.warning(f"Failed to backup vector counts: {e}")

    return backup_records


def _reindex_video_batch(videos: list, rollback_manager: TransactionRollbackManager):
    """
    Re-index a batch of videos with rollback support.
    Safely re-indexes into a temporary collection first, then swaps on success.

    Args:
        videos: List of Video objects to re-index
        rollback_manager: TransactionRollbackManager (kept for interface compatibility, though mostly unused for vector rollback now)

    Returns:
        Tuple of (successful_video_ids, failed_videos)
    """
    import uuid
    from app.utils.vector_manager import delete_collection, swap_video_vectors

    successful_video_ids = []
    failed_videos = []
    
    # Get main collection name
    main_collection = PGVectorManager.get_config()["collection_name"]

    for video in videos:
        # Create a unique temp collection name
        temp_collection = f"temp_reindex_{video.id}_{uuid.uuid4().hex[:8]}"
        
        try:
            logger.info(f"Indexing video {video.id} to temp collection: {temp_collection}")
            
            # 1. Index to temporary collection (Existing vectors in main are safe)
            index_scenes_batch(video.transcript, video, collection_name=temp_collection)

            # 2. On success, perform safe swap (Atomic)
            swap_video_vectors(video.id, temp_collection, main_collection)
            
            # 3. Cleanup temp collection
            delete_collection(temp_collection)

            successful_video_ids.append(video.id)

            logger.info(f"Successfully re-indexed video {video.id} ({video.title})")

        except Exception as e:
            logger.error(
                f"Failed to re-index video {video.id}: {str(e)}", exc_info=True
            )
            failed_videos.append(
                {"video_id": video.id, "title": video.title, "error": str(e)}
            )
            
            # Cleanup temp collection on failure
            try:
                delete_collection(temp_collection)
            except Exception as cleanup_error:
                logger.warning(f"Failed to cleanup temp collection {temp_collection}: {cleanup_error}")

    return successful_video_ids, failed_videos


@shared_task(bind=True)
def reindex_all_videos_embeddings(self):
    """
    Regenerate embedding vectors for all videos using batch processing.
    Used when switching embedding models (EMBEDDING_PROVIDER/EMBEDDING_MODEL)

    Returns:
        dict: Result containing status, counts, and error information
    """
    try:
        # 1. Get completed videos with transcripts
        videos = list(
            Video.objects.filter(status="completed")
            .exclude(transcript__isnull=True)
            .exclude(transcript="")
            .select_related("user")
        )

        total = len(videos)
        logger.info(f"Starting re-indexing: {total} videos")

        if total == 0:
            return {
                "status": "completed",
                "total_videos": 0,
                "successful_count": 0,
                "failed_count": 0,
                "message": "No videos to re-index",
            }

        # 2. Process videos in batches
        successful_count = 0
        failed_videos = []

        for batch_start in range(0, total, REINDEX_BATCH_SIZE):
            batch_end = min(batch_start + REINDEX_BATCH_SIZE, total)
            batch_videos = videos[batch_start:batch_end]
            batch_num = (batch_start // REINDEX_BATCH_SIZE) + 1
            total_batches = (total + REINDEX_BATCH_SIZE - 1) // REINDEX_BATCH_SIZE

            logger.info(f"Processing batch {batch_num}/{total_batches}")

            # Create rollback manager for this batch
            rollback_manager = TransactionRollbackManager()
            batch_success_ids = []

            try:
                # Backup vector counts before batch processing
                video_ids = [v.id for v in batch_videos]
                backup_records = _backup_video_ids(video_ids)
                if backup_records:
                    logger.info(f"Backed up vector metadata for {len(backup_records)} videos")

                # Re-index batch
                batch_success_ids, batch_failed = _reindex_video_batch(
                    batch_videos, rollback_manager
                )
                successful_count += len(batch_success_ids)
                failed_videos.extend(batch_failed)

                # Batch succeeded - clear rollbacks
                rollback_manager.clear()

                logger.info(
                    f"Batch {batch_num}/{total_batches} completed: "
                    f"{len(batch_success_ids)} success, {len(batch_failed)} failed"
                )

            except Exception as e:
                logger.error(f"Batch {batch_num} failed: {e}", exc_info=True)
                # Execute rollbacks for this batch
                rollback_errors = rollback_manager.execute_rollbacks()
                if rollback_errors:
                    logger.warning(f"Batch rollback errors: {rollback_errors}")

                # Continue with next batch instead of failing completely
                # Only mark videos as failed if they weren't already successfully processed
                for video in batch_videos:
                    if video.id not in batch_success_ids and not any(
                        f["video_id"] == video.id for f in failed_videos
                    ):
                        failed_videos.append(
                            {
                                "video_id": video.id,
                                "title": video.title,
                                "error": str(e),
                            }
                        )

        # 3. Return result
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
