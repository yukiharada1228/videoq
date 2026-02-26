"""
Account deletion tasks
"""

import logging

from celery import shared_task
from django.db import transaction

from app.models import ChatLog, Tag, User, Video, VideoGroup

logger = logging.getLogger(__name__)


def _delete_user_videos(user):
    videos = Video.objects.filter(user=user).order_by("id")
    for video in videos:
        file_field = video.file if video.file else None
        with transaction.atomic():
            video.delete()
            if file_field:
                transaction.on_commit(lambda f=file_field: f.delete(save=False))


@shared_task(bind=True)
def delete_account_data(self, user_id: int) -> None:
    user = User.objects.filter(id=user_id).first()
    if not user:
        logger.warning("Account deletion: user %s not found", user_id)
        return None

    _delete_user_videos(user)

    ChatLog.objects.filter(user=user).delete()
    VideoGroup.objects.filter(user=user).delete()
    Tag.objects.filter(user=user).delete()

    logger.info("Account deletion: related data deleted for user %s", user_id)
    return None
