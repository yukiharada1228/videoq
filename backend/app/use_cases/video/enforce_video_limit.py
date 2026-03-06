"""
Use case: Enforce a user's video_limit by deleting oldest excess videos.
"""

import logging

from django.db import transaction

from app.domain.video.dto import VideoSearchCriteria
from app.domain.video.gateways import VectorStoreGateway
from app.domain.video.repositories import VideoRepository

logger = logging.getLogger(__name__)


class EnforceVideoLimitUseCase:
    """
    Orchestrates video limit enforcement:
    1. List videos oldest-first
    2. Delete excess videos beyond the new limit
    3. Best-effort cleanup of vector data for deleted videos
    """

    def __init__(self, video_repo: VideoRepository, vector_gateway: VectorStoreGateway):
        self.video_repo = video_repo
        self.vector_gateway = vector_gateway

    def estimate_deleted_count(self, user_id: int, video_limit: int | None) -> int:
        """Return how many videos would be deleted to satisfy the new limit."""
        if video_limit is None:
            return 0
        current_count = self.video_repo.count_for_user(user_id)
        return max(0, current_count - video_limit)

    def execute(self, user_id: int, video_limit: int | None) -> int:
        """
        Returns:
            int: Number of videos deleted to satisfy the limit.
        """
        if video_limit is None:
            return 0

        excess_count = self.estimate_deleted_count(user_id=user_id, video_limit=video_limit)
        if excess_count <= 0:
            return 0

        videos = self.video_repo.list_for_user(
            user_id=user_id,
            criteria=VideoSearchCriteria(sort_key="uploaded_at_asc"),
        )

        deleted_count = 0
        deleted_video_ids: list[int] = []
        for video in videos[:excess_count]:
            self.video_repo.delete(video)
            deleted_count += 1
            deleted_video_ids.append(video.id)

        def _cleanup_vectors() -> None:
            for video_id in deleted_video_ids:
                try:
                    self.vector_gateway.delete_video_vectors(video_id)
                except Exception:
                    logger.warning(
                        "Failed to delete vectors for video %s during limit enforcement",
                        video_id,
                        exc_info=True,
                    )

        transaction.on_commit(_cleanup_vectors)

        logger.info(
            "Deleted %s excess videos for user_id=%s to enforce video_limit=%s",
            deleted_count,
            user_id,
            video_limit,
        )
        return deleted_count
