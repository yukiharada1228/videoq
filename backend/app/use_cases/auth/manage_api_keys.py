"""
Use cases for managing user API keys.
"""

from typing import List

from app.domain.auth.entities import (
    assert_api_key_name_available,
    assert_valid_api_key_access_level,
    normalize_api_key_name,
)
from app.domain.auth.repositories import ApiKeyRepository
from app.use_cases.auth.dto import ApiKeyCreateResultDTO, ApiKeyResponseDTO
from app.use_cases.shared.exceptions import ResourceNotFound


def _to_api_key_response_dto(entity) -> ApiKeyResponseDTO:
    return ApiKeyResponseDTO(
        id=entity.id,
        name=entity.name,
        prefix=entity.prefix,
        access_level=entity.access_level,
        last_used_at=entity.last_used_at,
        created_at=entity.created_at,
    )


class ListApiKeysUseCase:
    """Return all active API keys for a user."""

    def __init__(self, api_key_repo: ApiKeyRepository):
        self.api_key_repo = api_key_repo

    def execute(self, user_id: int) -> List[ApiKeyResponseDTO]:
        return [
            _to_api_key_response_dto(entity) for entity in self.api_key_repo.list_for_user(user_id)
        ]


class CreateApiKeyUseCase:
    """Create a new API key for a user."""

    def __init__(self, api_key_repo: ApiKeyRepository):
        self.api_key_repo = api_key_repo

    def execute(self, user_id: int, name: str, access_level: str) -> ApiKeyCreateResultDTO:
        """
        Raises:
            DuplicateApiKeyName: If an active key with this name already exists.
        """
        normalized_name = normalize_api_key_name(name)
        assert_api_key_name_available(
            name=normalized_name,
            exists_active_with_name=self.api_key_repo.exists_active_with_name(
                user_id, normalized_name
            ),
        )
        assert_valid_api_key_access_level(access_level)
        created = self.api_key_repo.create_for_user(user_id, normalized_name, access_level)
        return ApiKeyCreateResultDTO(
            api_key=_to_api_key_response_dto(created.api_key),
            raw_key=created.raw_key,
        )


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
