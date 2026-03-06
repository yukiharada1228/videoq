"""
Django ORM implementation of UserDataDeletionGateway.
Handles bulk deletion of all data associated with a user account.
"""

import logging

from django.db import transaction

from app.domain.auth.gateways import UserDataDeletionGateway
from app.infrastructure.external.vector_store import delete_video_vectors

logger = logging.getLogger(__name__)


class DjangoUserDataDeletionGateway(UserDataDeletionGateway):
    """Deletes all user-owned data using Django ORM."""

    def delete_all_videos_for_user(self, user_id: int) -> None:
        from app.models import Video

        videos = Video.objects.filter(user_id=user_id).order_by("id")
        for video in videos:
            file_field = video.file if video.file else None
            video_id = video.id
            with transaction.atomic():
                video.delete()
                if file_field:
                    transaction.on_commit(lambda f=file_field: f.delete(save=False))
            delete_video_vectors(video_id)

    def delete_chat_history_for_user(self, user_id: int) -> None:
        from app.models import ChatLog

        ChatLog.objects.filter(user_id=user_id).delete()

    def delete_video_groups_for_user(self, user_id: int) -> None:
        from app.models import VideoGroup

        VideoGroup.objects.filter(user_id=user_id).delete()

    def delete_tags_for_user(self, user_id: int) -> None:
        from app.models import Tag

        Tag.objects.filter(user_id=user_id).delete()
