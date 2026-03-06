"""
Use case: Index a single video's transcript into the vector store.
Runs asynchronously after transcription completes.
"""

import logging

from app.domain.video.gateways import VectorIndexingGateway
from app.domain.video.repositories import VideoTranscriptionRepository
from app.use_cases.video.exceptions import IndexingExecutionFailed, IndexingTargetMissing

logger = logging.getLogger(__name__)


class IndexVideoTranscriptUseCase:
    """
    Orchestrates vector indexing for a single video:
    1. Fetch the completed video with its transcript
    2. Index all scenes to the vector store
    """

    def __init__(
        self,
        video_repo: VideoTranscriptionRepository,
        vector_indexing_gateway: VectorIndexingGateway,
    ):
        self.video_repo = video_repo
        self.vector_gateway = vector_indexing_gateway

    def execute(self, video_id: int) -> None:
        """
        Raises:
            IndexingTargetMissing: If the video does not exist or has no transcript.
            IndexingExecutionFailed: If vector indexing raises an error.
        """
        video = self.video_repo.get_by_id_for_task(video_id)
        if video is None or video.transcript is None:
            raise IndexingTargetMissing(video_id)

        try:
            self.vector_gateway.index_video_transcript(
                video.id, video.user_id, video.title, video.transcript
            )
        except Exception as e:
            raise IndexingExecutionFailed(video_id=video_id, reason=str(e)) from e

        logger.info("Indexed transcript for video %d", video_id)
