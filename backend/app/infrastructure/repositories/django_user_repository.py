"""
Django ORM implementation of user domain repository interfaces.
"""

from typing import Optional

from django.contrib.auth import get_user_model
from django.db.models import Count

from app.infrastructure.common.cipher import FernetCipher
from app.domain.user.entities import UserEntity
from app.domain.user.repositories import UserRepository

User = get_user_model()


def _to_entity(user, video_count: int = 0) -> UserEntity:
    cipher = FernetCipher()
    encrypted_api_key = getattr(user, "searchapi_api_key_encrypted", None)
    return UserEntity(
        id=user.pk,
        username=user.username,
        email=user.email,
        is_active=user.is_active,
        max_video_upload_size_mb=user.max_video_upload_size_mb,
        video_count=video_count,
        storage_limit_gb=user.storage_limit_gb,
        processing_limit_minutes=user.processing_limit_minutes,
        ai_answers_limit=user.ai_answers_limit,
        used_storage_bytes=user.used_storage_bytes,
        used_processing_seconds=user.used_processing_seconds,
        used_ai_answers=user.used_ai_answers,
        unlimited_processing_minutes=user.unlimited_processing_minutes,
        unlimited_ai_answers=user.unlimited_ai_answers,
        is_over_quota=user.is_over_quota,
        searchapi_api_key=(
            cipher.decrypt(encrypted_api_key)
            if encrypted_api_key
            else None
        ),
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

    def has_searchapi_api_key(self, user_id: int) -> bool:
        return User.objects.filter(
            pk=user_id,
            searchapi_api_key_encrypted__isnull=False,
        ).exists()

    def set_searchapi_api_key(self, user_id: int, api_key: str) -> bool:
        encrypted = FernetCipher().encrypt(api_key)
        updated = User.objects.filter(pk=user_id).update(searchapi_api_key_encrypted=encrypted)
        return updated > 0

    def delete_searchapi_api_key(self, user_id: int) -> bool:
        updated = User.objects.filter(pk=user_id).update(searchapi_api_key_encrypted=None)
        return updated > 0
