"""
Django ORM implementation of API key resolver.
"""

from app.domain.auth.dtos import ApiKeyAuthContextDTO
from app.infrastructure.models import UserApiKey


class DjangoApiKeyResolver:
    def resolve(self, api_key: str) -> ApiKeyAuthContextDTO | None:
        hashed_key = UserApiKey.hash_key(api_key)
        key = (
            UserApiKey.objects.select_related("user")
            .filter(
                hashed_key=hashed_key,
                revoked_at__isnull=True,
                user__is_active=True,
            )
            .first()
        )
        if key is None:
            return None

        key.mark_used()
        return ApiKeyAuthContextDTO(
            api_key_id=key.id,
            user_id=key.user_id,
            user_video_limit=key.user.video_limit,
            access_level=key.access_level,
        )
