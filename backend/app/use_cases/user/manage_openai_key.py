"""Use cases for managing a user's OpenAI API key."""

from app.domain.user.ports import OpenAiApiKeyRepository
from app.use_cases.user.dto import OpenAiApiKeyStatusDTO


class SaveOpenAiApiKeyUseCase:
    def __init__(self, repo: OpenAiApiKeyRepository):
        self._repo = repo

    def execute(self, user_id: int, api_key: str) -> None:
        self._repo.save_encrypted_key(user_id, api_key)


class DeleteOpenAiApiKeyUseCase:
    def __init__(self, repo: OpenAiApiKeyRepository):
        self._repo = repo

    def execute(self, user_id: int) -> None:
        self._repo.delete_key(user_id)


class GetOpenAiApiKeyStatusUseCase:
    def __init__(self, repo: OpenAiApiKeyRepository):
        self._repo = repo

    def execute(self, user_id: int) -> OpenAiApiKeyStatusDTO:
        return OpenAiApiKeyStatusDTO(
            has_key=self._repo.has_key(user_id),
            masked_key=self._repo.get_masked_key(user_id),
        )
