"""
Use case: Regenerate embedding vectors for all completed videos.
"""

import logging

from app.domain.video.gateways import VectorIndexingGateway
from app.domain.video.repositories import VideoTranscriptionRepository

logger = logging.getLogger(__name__)


class ReindexAllVideosUseCase:
    """
    Orchestrates full re-indexing of all video transcripts:
    1. Fetch all completed videos with transcripts
    2. Delete all existing vectors
    3. Re-index each video's transcript
    """

    def __init__(
        self,
        video_repo: VideoTranscriptionRepository,
        vector_indexing_gateway: VectorIndexingGateway,
    ):
        self.video_repo = video_repo
        self.vector_gateway = vector_indexing_gateway

    def execute(self) -> dict:
        videos = self.video_repo.list_completed_with_transcript()
        total = len(videos)

        logger.info("Starting re-indexing: %d videos", total)

        if total == 0:
            return {
                "status": "completed",
                "total_videos": 0,
                "successful_count": 0,
                "failed_count": 0,
                "message": "No videos to re-index",
            }

        deleted_count = self.vector_gateway.delete_all_vectors()
        logger.info("Deleted %d vectors", deleted_count)

        successful_count = 0
        failed_videos = []

        for index, video in enumerate(videos, start=1):
            try:
                if video.transcript is None:
                    raise ValueError("Transcript is missing")
                self.vector_gateway.index_video_transcript(
                    video.id, video.user_id, video.title, video.transcript
                )
                successful_count += 1
                logger.info(
                    "[%d/%d] Re-indexed video %d (%s)", index, total, video.id, video.title
                )
            except Exception as e:
                logger.error("Failed to re-index video %d: %s", video.id, e, exc_info=True)
                failed_videos.append(
                    {"video_id": video.id, "title": video.title, "error": str(e)}
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
