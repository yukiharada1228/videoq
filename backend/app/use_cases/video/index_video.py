"""
Use case: Index a single video's transcript into the vector store.
Runs asynchronously after transcription completes (status: INDEXING).
"""

import logging

from app.domain.video.gateways import VectorIndexingGateway
from app.domain.video.repositories import VideoTranscriptionRepository
from app.domain.video.status import VideoStatus
from app.use_cases.video.exceptions import IndexingExecutionFailed, IndexingTargetMissing

logger = logging.getLogger(__name__)


class IndexVideoTranscriptUseCase:
    """
    Orchestrates vector indexing for a single video:
    1. Fetch the video in INDEXING status with its transcript
    2. Index all scenes to the vector store
    3. Transition status INDEXING → COMPLETED on success
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

        VideoStatus.INDEXING.assert_transition_to(VideoStatus.COMPLETED)
        self.video_repo.transition_status(
            video_id=video_id,
            from_status=VideoStatus.INDEXING,
            to_status=VideoStatus.COMPLETED,
        )
        logger.info("Indexed transcript and marked COMPLETED for video %d", video_id)

    def mark_failed(self, video_id: int, reason: str = "") -> None:
        """Transition INDEXING → ERROR after all retries are exhausted."""
        try:
            VideoStatus.INDEXING.assert_transition_to(VideoStatus.ERROR)
            self.video_repo.transition_status(
                video_id=video_id,
                from_status=VideoStatus.INDEXING,
                to_status=VideoStatus.ERROR,
                error_message=reason,
            )
            logger.error("Marked video %d as ERROR after indexing exhausted retries", video_id)
        except Exception:
            logger.exception(
                "Failed to mark video %d as ERROR after indexing failure", video_id
            )
