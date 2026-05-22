"""
Use case: Reindex a video's transcript in the vector store after a manual edit.
Can run asynchronously after the transcript update is committed.
"""

import logging

from app.domain.video.gateways import VectorIndexingGateway, VectorStoreGateway
from app.domain.video.repositories import VideoTranscriptionRepository

logger = logging.getLogger(__name__)


class ReindexVideoTranscriptUseCase:
    """
    Orchestrates vector reindexing after a manual transcript edit:
    1. Fetch the video (no status restriction — video is already COMPLETED)
    2. Delete existing vectors
    3. Re-index from the current transcript (skip if empty)
    """

    def __init__(
        self,
        video_repo: VideoTranscriptionRepository,
        vector_store_gateway: VectorStoreGateway,
        vector_indexing_gateway: VectorIndexingGateway,
    ):
        self.video_repo = video_repo
        self.vector_store_gateway = vector_store_gateway
        self.vector_indexing_gateway = vector_indexing_gateway

    def execute(self, video_id: int) -> None:
        video = self.video_repo.get_by_id_for_task(video_id)
        if video is None:
            logger.warning("ReindexVideoTranscript: video %d not found, skipping", video_id)
            return

        self.vector_store_gateway.delete_video_vectors(video_id)

        if video.transcript:
            self.vector_indexing_gateway.index_video_transcript(
                video.id,
                video.user_id,
                video.title,
                video.transcript,
                api_key=None,
            )
            logger.info("Reindexed transcript for video %d", video_id)
        else:
            logger.info("Transcript cleared for video %d; vectors deleted, no reindex", video_id)
