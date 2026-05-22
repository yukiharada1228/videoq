"""
Use case: Update a video and sync PGVector metadata when the title changes.
"""

import logging

from app.domain.shared.transaction import TransactionPort
from app.domain.video.dto import UpdateVideoParams
from app.domain.video.gateways import VideoTaskGateway, VectorStoreGateway
from app.domain.video.repositories import VideoRepository
from app.use_cases.video.dto import UpdateVideoInput, VideoResponseDTO
from app.use_cases.video.exceptions import ResourceNotFound
from app.use_cases.video.file_url import to_video_response_dto

logger = logging.getLogger(__name__)


class UpdateVideoUseCase:
    """
    Orchestrates video update:
    1. Retrieve the video
    2. Apply changes
    3. Sync PGVector metadata if the title changed
    4. Enqueue async transcript reindex if the transcript changed
    """

    def __init__(
        self,
        video_repo: VideoRepository,
        vector_gateway: VectorStoreGateway,
        task_gateway: VideoTaskGateway,
        tx: TransactionPort,
    ):
        self.video_repo = video_repo
        self.vector_gateway = vector_gateway
        self.task_gateway = task_gateway
        self.tx = tx

    def execute(self, video_id: int, user_id: int, input: UpdateVideoInput) -> VideoResponseDTO:
        """
        Returns:
            VideoResponseDTO: The updated video.

        Raises:
            ResourceNotFound: If the video does not exist or is not owned by the user.
        """
        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")

        with self.tx.atomic():
            old_title = video.title
            old_transcript = video.transcript or ""
            params = UpdateVideoParams(
                title=input.title,
                description=input.description,
                transcript=input.transcript,
            )
            video = self.video_repo.update(video, params)
            transcript_changed = input.transcript is not None and input.transcript != old_transcript

            if input.title is not None and old_title != video.title:
                def _sync_vector_title() -> None:
                    try:
                        self.vector_gateway.update_video_title(video.id, video.title)
                    except Exception:
                        logger.warning(
                            "Failed to sync vector title for video %s after update",
                            video.id,
                            exc_info=True,
                        )

                self.tx.on_commit(_sync_vector_title)

            if transcript_changed:
                self.tx.on_commit(lambda: self.task_gateway.enqueue_reindex_transcript(video.id))

        return to_video_response_dto(video)
