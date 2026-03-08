"""Infrastructure implementations of task queue gateways."""

from celery import current_app
from django.db import transaction

from app.domain.auth.gateways import AuthTaskGateway
from app.domain.video.gateways import VideoTaskGateway
from app.contracts.tasks import (
    DELETE_ACCOUNT_DATA_TASK,
    INDEX_VIDEO_TRANSCRIPT_TASK,
    REINDEX_ALL_VIDEOS_EMBEDDINGS_TASK,
    TRANSCRIBE_VIDEO_TASK,
)


class CeleryVideoTaskGateway(VideoTaskGateway):
    """Implements VideoTaskGateway using Celery tasks."""

    def enqueue_transcription(self, video_id: int) -> None:
        """Dispatch transcription task after the current DB transaction commits."""
        transaction.on_commit(
            lambda: current_app.send_task(
                TRANSCRIBE_VIDEO_TASK,
                args=[video_id],
            )
        )

    def enqueue_indexing(self, video_id: int) -> None:
        """Dispatch vector indexing task after the current DB transaction commits."""
        transaction.on_commit(
            lambda: current_app.send_task(
                INDEX_VIDEO_TRANSCRIPT_TASK,
                args=[video_id],
            )
        )

    def enqueue_reindex_all_videos_embeddings(self) -> str:
        """Dispatch full re-indexing task immediately and return task id."""
        result = current_app.send_task(REINDEX_ALL_VIDEOS_EMBEDDINGS_TASK)
        return result.id


class CeleryAuthTaskGateway(AuthTaskGateway):
    """Implements AuthTaskGateway using Celery tasks."""

    def enqueue_account_deletion(self, user_id: int) -> None:
        """Dispatch account data deletion task after the current DB transaction commits."""
        transaction.on_commit(
            lambda: current_app.send_task(
                DELETE_ACCOUNT_DATA_TASK,
                args=[user_id],
            )
        )
