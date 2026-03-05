"""
Infrastructure implementations of task queue gateways.
Dispatches async tasks via Celery, using Django's transaction.on_commit where appropriate.
"""

from django.db import transaction

from app.domain.auth.gateways import AuthTaskGateway
from app.domain.video.gateways import VideoTaskGateway


class CeleryVideoTaskGateway(VideoTaskGateway):
    """Implements VideoTaskGateway using Celery tasks."""

    def enqueue_transcription(self, video_id: int) -> None:
        """Dispatch transcription task after the current DB transaction commits."""
        from app.tasks import transcribe_video

        transaction.on_commit(lambda: transcribe_video.delay(video_id))


class CeleryAuthTaskGateway(AuthTaskGateway):
    """Implements AuthTaskGateway using Celery tasks."""

    def enqueue_account_deletion(self, user_id: int) -> None:
        """Dispatch account data deletion task immediately."""
        from app.tasks.account_deletion import delete_account_data

        delete_account_data.delay(user_id)
