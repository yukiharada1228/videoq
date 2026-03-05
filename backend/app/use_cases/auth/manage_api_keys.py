"""
Use cases for managing user API keys.
"""

from typing import List

from app.domain.auth.entities import ApiKeyCreateResult, ApiKeyEntity
from app.domain.auth.repositories import ApiKeyRepository
from app.use_cases.video.exceptions import ResourceNotFound


class ListApiKeysUseCase:
    """Return all active API keys for a user."""

    def __init__(self, api_key_repo: ApiKeyRepository):
        self.api_key_repo = api_key_repo

    def execute(self, user_id: int) -> List[ApiKeyEntity]:
        return self.api_key_repo.list_for_user(user_id)


class CreateApiKeyUseCase:
    """Create a new API key for a user."""

    def __init__(self, api_key_repo: ApiKeyRepository):
        self.api_key_repo = api_key_repo

    def execute(self, user_id: int, name: str, access_level: str) -> ApiKeyCreateResult:
        """
        Raises:
            ValueError: If an active key with this name already exists.
        """
        if self.api_key_repo.exists_active_with_name(user_id, name):
            raise ValueError("An active API key with this name already exists.")
        return self.api_key_repo.create_for_user(user_id, name, access_level)


class RevokeApiKeyUseCase:
    """Revoke an active API key."""

    def __init__(self, api_key_repo: ApiKeyRepository):
        self.api_key_repo = api_key_repo

    def execute(self, key_id: int, user_id: int) -> None:
        """
        Raises:
            ResourceNotFound: If the key does not exist or is already revoked.
        """
        found = self.api_key_repo.revoke(key_id, user_id)
        if not found:
            raise ResourceNotFound("ApiKey")
