"""
Use case: Transcribe a video and index its scenes for RAG search.
"""

import logging

from app.domain.video.gateways import TranscriptionGateway, VectorIndexingGateway
from app.domain.video.repositories import VideoTranscriptionRepository

logger = logging.getLogger(__name__)


class RunTranscriptionUseCase:
    """
    Orchestrates video transcription:
    1. Validate video exists and is ready for processing
    2. Transition status to processing (via entity method)
    3. Run transcription (audio extraction + Whisper + scene splitting)
    4. Persist transcript and transition status to completed (via entity method)
    5. Index scenes to vector store for RAG search
    On error: transition status to error (via entity method) and re-raise.
    """

    def __init__(
        self,
        video_repo: VideoTranscriptionRepository,
        transcription_gateway: TranscriptionGateway,
        vector_indexing_gateway: VectorIndexingGateway,
    ):
        self.video_repo = video_repo
        self.transcription_gateway = transcription_gateway
        self.vector_gateway = vector_indexing_gateway

    def execute(self, video_id: int) -> None:
        video = self.video_repo.get_by_id_for_task(video_id)
        if video is None:
            raise ValueError(f"Video {video_id} not found")

        # Domain entity validates and performs the transition
        video.start_processing()

        logger.info("Transcription started for video %d (%s)", video.id, video.title)
        self.video_repo.save(video)

        try:
            transcript = self.transcription_gateway.run(video_id)
            self.video_repo.save_transcript(video_id, transcript)
            video.complete()
            self.video_repo.save(video)
            self.vector_gateway.index_video_transcript(
                video.id, video.user_id, video.title, transcript
            )
            logger.info("Transcription completed for video %d", video_id)
        except Exception as e:
            error_msg = str(e)
            logger.error("Transcription failed for video %d: %s", video_id, error_msg)
            video.fail(error_msg)
            self.video_repo.save(video)
            raise


