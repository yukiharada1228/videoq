"""
Re-indexing task trigger.
Delegates all logic to ReindexAllVideosUseCase.
"""

import logging

from celery import shared_task

from app.contracts.tasks import REINDEX_ALL_VIDEOS_EMBEDDINGS_TASK
from app.dependencies.tasks import get_reindex_all_videos_use_case

logger = logging.getLogger(__name__)


@shared_task(bind=True, name=REINDEX_ALL_VIDEOS_EMBEDDINGS_TASK)
def reindex_all_videos_embeddings(self):
    """
    Regenerate embedding vectors for all videos.
    Used when switching embedding models (EMBEDDING_PROVIDER/EMBEDDING_MODEL).
    """
    logger.info("Re-indexing task started")
    try:
        result = get_reindex_all_videos_use_case().execute()
        logger.info("Re-indexing completed: %s", result.get("message"))
        return result
    except Exception:
        logger.exception("Re-indexing task failed")
        raise
