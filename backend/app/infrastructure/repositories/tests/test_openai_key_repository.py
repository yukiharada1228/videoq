"""Tests for DjangoOpenAiApiKeyRepository."""

from django.test import TestCase

from app.infrastructure.models import User
from app.infrastructure.repositories.django_openai_key_repository import (
    DjangoOpenAiApiKeyRepository,
)


class DjangoOpenAiApiKeyRepositoryTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", email="test@example.com", password="pass1234"
        )
        self.repo = DjangoOpenAiApiKeyRepository()

    def test_save_and_get(self):
        self.repo.save_encrypted_key(self.user.id, "sk-test1234567890abcdef")
        result = self.repo.get_decrypted_key(self.user.id)
        self.assertEqual(result, "sk-test1234567890abcdef")

    def test_get_returns_none_when_not_set(self):
        result = self.repo.get_decrypted_key(self.user.id)
        self.assertIsNone(result)

    def test_has_key_true(self):
        self.repo.save_encrypted_key(self.user.id, "sk-abc")
        self.assertTrue(self.repo.has_key(self.user.id))

    def test_has_key_false(self):
        self.assertFalse(self.repo.has_key(self.user.id))

    def test_delete_key(self):
        self.repo.save_encrypted_key(self.user.id, "sk-to-delete")
        self.assertTrue(self.repo.has_key(self.user.id))
        self.repo.delete_key(self.user.id)
        self.assertFalse(self.repo.has_key(self.user.id))
        self.assertIsNone(self.repo.get_decrypted_key(self.user.id))

    def test_get_masked_key(self):
        self.repo.save_encrypted_key(self.user.id, "sk-proj-abcdefgh1234")
        masked = self.repo.get_masked_key(self.user.id)
        self.assertEqual(masked, "sk-...1234")

    def test_get_masked_key_none_when_not_set(self):
        self.assertIsNone(self.repo.get_masked_key(self.user.id))

    def test_overwrite_key(self):
        self.repo.save_encrypted_key(self.user.id, "sk-old-key")
        self.repo.save_encrypted_key(self.user.id, "sk-new-key")
        self.assertEqual(self.repo.get_decrypted_key(self.user.id), "sk-new-key")

    def test_nonexistent_user(self):
        self.assertIsNone(self.repo.get_decrypted_key(99999))
        self.assertFalse(self.repo.has_key(99999))
