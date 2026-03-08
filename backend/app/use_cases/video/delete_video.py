"""
Use case: Delete a video (hard delete) and clean up its file.
"""

import logging

from app.domain.shared.transaction import TransactionPort
from app.domain.video.gateways import VectorStoreGateway
from app.domain.video.repositories import VideoRepository
from app.use_cases.video.exceptions import ResourceNotFound

logger = logging.getLogger(__name__)


class DeleteVideoUseCase:
    """
    Orchestrates video deletion:
    1. Retrieve the video
    2. Delete the DB record (CASCADE handles VideoGroupMember)
    3. Delete associated vectors
    4. File cleanup is handled by the repository after the transaction commits
    """

    def __init__(
        self,
        video_repo: VideoRepository,
        vector_gateway: VectorStoreGateway,
        tx: TransactionPort,
    ):
        self.video_repo = video_repo
        self.vector_gateway = vector_gateway
        self.tx = tx

    def execute(self, video_id: int, user_id: int) -> None:
        """
        Raises:
            ResourceNotFound: If the video does not exist or is not owned by the user.
        """
        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")

        with self.tx.atomic():
            self.video_repo.delete(video)

            def _cleanup_vectors() -> None:
                try:
                    self.vector_gateway.delete_video_vectors(video.id)
                except Exception:
                    logger.warning(
                        "Failed to delete vectors for video %s after video deletion",
                        video.id,
                        exc_info=True,
                    )

            self.tx.on_commit(_cleanup_vectors)
