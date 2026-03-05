"""
Django ORM implementation of ApiKeyRepository.
"""

from typing import List, Optional

from django.contrib.auth import get_user_model

from app.domain.auth.entities import ACCESS_LEVEL_ALL, ApiKeyCreateResult, ApiKeyEntity
from app.domain.auth.repositories import ApiKeyRepository
from app.models import UserApiKey


def _key_to_entity(key: UserApiKey) -> ApiKeyEntity:
    return ApiKeyEntity(
        id=key.id,
        name=key.name,
        prefix=key.prefix,
        access_level=key.access_level,
        last_used_at=key.last_used_at,
        created_at=key.created_at,
        revoked_at=key.revoked_at,
    )


class DjangoApiKeyRepository(ApiKeyRepository):
    def list_for_user(self, user_id: int) -> List[ApiKeyEntity]:
        keys = UserApiKey.objects.filter(user_id=user_id, revoked_at__isnull=True)
        return [_key_to_entity(k) for k in keys]

    def create_for_user(
        self,
        user_id: int,
        name: str,
        access_level: str = ACCESS_LEVEL_ALL,
    ) -> ApiKeyCreateResult:
        user = get_user_model().objects.get(pk=user_id)
        api_key, raw_key = UserApiKey.create_for_user(
            user=user, name=name, access_level=access_level
        )
        return ApiKeyCreateResult(api_key=_key_to_entity(api_key), raw_key=raw_key)

    def get_active_by_id(self, key_id: int, user_id: int) -> Optional[ApiKeyEntity]:
        try:
            key = UserApiKey.objects.get(
                pk=key_id, user_id=user_id, revoked_at__isnull=True
            )
            return _key_to_entity(key)
        except UserApiKey.DoesNotExist:
            return None

    def revoke(self, key_id: int, user_id: int) -> bool:
        try:
            key = UserApiKey.objects.get(
                pk=key_id, user_id=user_id, revoked_at__isnull=True
            )
            key.revoke()
            return True
        except UserApiKey.DoesNotExist:
            return False

    def exists_active_with_name(self, user_id: int, name: str) -> bool:
        return UserApiKey.objects.filter(
            user_id=user_id,
            name=name,
            revoked_at__isnull=True,
        ).exists()
