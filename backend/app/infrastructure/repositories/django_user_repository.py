"""
Django ORM implementation of user domain repository interfaces.
"""

from django.contrib.auth import get_user_model
from django.db.models import Count

from app.domain.user.repositories import UserRepository

User = get_user_model()


class DjangoUserRepository(UserRepository):
    """Django ORM implementation of UserRepository."""

    def get_by_id(self, user_id: int):
        return User.objects.filter(pk=user_id).first()

    def get_with_video_count(self, user_id: int):
        return User.objects.annotate(video_count=Count("videos")).get(pk=user_id)
