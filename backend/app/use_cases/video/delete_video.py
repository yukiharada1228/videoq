"""
Use case: Delete a video (hard delete) and clean up its file.
"""

import logging
from typing import Optional

from app.domain.shared.transaction import TransactionPort
from app.domain.video.gateways import FileUploadGateway, VectorStoreGateway
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
    5. (Optional) Record storage usage reduction for billing
    """

    def __init__(
        self,
        video_repo: VideoRepository,
        vector_gateway: VectorStoreGateway,
        tx: TransactionPort,
        upload_gateway: Optional[FileUploadGateway] = None,
        storage_record_use_case=None,
        over_quota_clear_use_case=None,
    ):
        self.video_repo = video_repo
        self.vector_gateway = vector_gateway
        self.tx = tx
        self._upload_gateway = upload_gateway
        self._storage_record_use_case = storage_record_use_case
        self._over_quota_clear_use_case = over_quota_clear_use_case

    def execute(self, video_id: int, user_id: int) -> None:
        """
        Raises:
            ResourceNotFound: If the video does not exist or is not owned by the user.
        """
        video = self.video_repo.get_by_id(video_id, user_id)
        if video is None:
            raise ResourceNotFound("Video")

        # Capture file size before deletion for billing (best-effort)
        file_size_bytes: Optional[int] = None
        if (
            self._storage_record_use_case is not None
            and self._upload_gateway is not None
            and video.file_key
        ):
            try:
                file_size_bytes = self._upload_gateway.get_file_size(video.file_key)
            except Exception:
                logger.warning(
                    "Could not determine file size for video %s before deletion",
                    video.id,
                    exc_info=True,
                )

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

        if self._storage_record_use_case is not None and file_size_bytes is not None:
            try:
                self._storage_record_use_case.execute(user_id, -file_size_bytes)
            except Exception:
                logger.warning(
                    "Failed to subtract storage usage for user %s after video deletion",
                    user_id,
                    exc_info=True,
                )

        if self._over_quota_clear_use_case is not None:
            try:
                self._over_quota_clear_use_case.execute(user_id)
            except Exception:
                logger.warning(
                    "Failed to clear over-quota flag for user %s after video deletion",
                    user_id,
                    exc_info=True,
                )
