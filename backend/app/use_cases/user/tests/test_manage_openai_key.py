"""Tests for OpenAI API key management use cases."""

from unittest import TestCase
from unittest.mock import MagicMock

from app.use_cases.user.manage_openai_key import (
    DeleteOpenAiApiKeyUseCase,
    GetOpenAiApiKeyStatusUseCase,
    SaveOpenAiApiKeyUseCase,
)


class SaveOpenAiApiKeyUseCaseTest(TestCase):
    def test_delegates_to_repo(self):
        repo = MagicMock()
        uc = SaveOpenAiApiKeyUseCase(repo)
        uc.execute(user_id=42, api_key="sk-test")
        repo.save_encrypted_key.assert_called_once_with(42, "sk-test")


class DeleteOpenAiApiKeyUseCaseTest(TestCase):
    def test_delegates_to_repo(self):
        repo = MagicMock()
        uc = DeleteOpenAiApiKeyUseCase(repo)
        uc.execute(user_id=42)
        repo.delete_key.assert_called_once_with(42)


class GetOpenAiApiKeyStatusUseCaseTest(TestCase):
    def test_returns_status_with_key(self):
        repo = MagicMock()
        repo.has_key.return_value = True
        repo.get_masked_key.return_value = "sk-...abcd"
        uc = GetOpenAiApiKeyStatusUseCase(repo, requires_openai_key=True)
        result = uc.execute(user_id=42)
        self.assertTrue(result.has_key)
        self.assertEqual(result.masked_key, "sk-...abcd")

    def test_returns_status_without_key(self):
        repo = MagicMock()
        repo.has_key.return_value = False
        repo.get_masked_key.return_value = None
        uc = GetOpenAiApiKeyStatusUseCase(repo, requires_openai_key=True)
        result = uc.execute(user_id=42)
        self.assertFalse(result.has_key)
        self.assertIsNone(result.masked_key)

    def test_is_required_true_when_openai_needed(self):
        repo = MagicMock()
        repo.has_key.return_value = False
        repo.get_masked_key.return_value = None
        uc = GetOpenAiApiKeyStatusUseCase(repo, requires_openai_key=True)
        result = uc.execute(user_id=1)
        self.assertTrue(result.is_required)

    def test_is_required_false_when_local_provider(self):
        repo = MagicMock()
        repo.has_key.return_value = False
        repo.get_masked_key.return_value = None
        uc = GetOpenAiApiKeyStatusUseCase(repo, requires_openai_key=False)
        result = uc.execute(user_id=1)
        self.assertFalse(result.is_required)
