"""
Django ORM implementation of user domain repository interfaces.
"""

from typing import Optional

from django.contrib.auth import get_user_model
from django.db.models import Count

from app.domain.user.entities import UserEntity
from app.domain.user.repositories import UserRepository

User = get_user_model()


def _to_entity(user, video_count: int = 0) -> UserEntity:
    return UserEntity(
        id=user.pk,
        username=user.username,
        email=user.email,
        is_active=user.is_active,
        max_video_upload_size_mb=user.max_video_upload_size_mb,
        video_count=video_count,
    )


class DjangoUserRepository(UserRepository):
    """Django ORM implementation of UserRepository."""

    def get_by_id(self, user_id: int) -> Optional[UserEntity]:
        user = User.objects.filter(pk=user_id).first()
        if user is None:
            return None
        return _to_entity(user)

    def get_with_video_count(self, user_id: int) -> Optional[UserEntity]:
        user = User.objects.annotate(video_count=Count("videos")).filter(pk=user_id).first()
        if user is None:
            return None
        return _to_entity(user, video_count=user.video_count)
