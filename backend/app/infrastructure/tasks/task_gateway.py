"""Infrastructure implementations of task queue gateways."""

from celery import current_app
from django.db import transaction

from app.domain.auth.gateways import AuthTaskGateway
from app.domain.video.gateways import VideoTaskGateway
from app.contracts.tasks import (
    DELETE_ACCOUNT_DATA_TASK,
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


class CeleryAuthTaskGateway(AuthTaskGateway):
    """Implements AuthTaskGateway using Celery tasks."""

    def enqueue_account_deletion(self, user_id: int) -> None:
        """Dispatch account data deletion task immediately."""
        current_app.send_task(
            DELETE_ACCOUNT_DATA_TASK,
            args=[user_id],
        )
