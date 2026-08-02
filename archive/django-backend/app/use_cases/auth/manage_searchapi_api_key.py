"""Use cases for managing a user's SearchAPI API key."""

from app.domain.user.repositories import UserRepository
from app.use_cases.auth.dto import SearchApiKeyStatusOutput
from app.use_cases.shared.exceptions import ResourceNotFound


class GetSearchApiKeyStatusUseCase:
    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository

    def execute(self, user_id: int) -> SearchApiKeyStatusOutput:
        if self.user_repository.get_by_id(user_id) is None:
            raise ResourceNotFound("User")
        return SearchApiKeyStatusOutput(
            has_api_key=self.user_repository.has_searchapi_api_key(user_id),
        )


class SetSearchApiKeyUseCase:
    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository

    def execute(self, user_id: int, api_key: str) -> None:
        normalized_key = api_key.strip()
        if not normalized_key:
            raise ValueError("api_key is required")
        if not self.user_repository.set_searchapi_api_key(user_id, normalized_key):
            raise ResourceNotFound("User")


class DeleteSearchApiKeyUseCase:
    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository

    def execute(self, user_id: int) -> None:
        if not self.user_repository.delete_searchapi_api_key(user_id):
            raise ResourceNotFound("User")
