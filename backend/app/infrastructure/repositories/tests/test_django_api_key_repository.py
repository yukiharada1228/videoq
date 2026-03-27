"""Integration tests for DjangoApiKeyRepository."""

from django.contrib.auth import get_user_model
from django.test import TestCase

from app.domain.auth.entities import ACCESS_LEVEL_ALL
from app.infrastructure.repositories.django_api_key_repository import DjangoApiKeyRepository

User = get_user_model()


class DjangoApiKeyRepositoryTests(TestCase):
    def setUp(self):
        self.repo = DjangoApiKeyRepository()
        self.user = User.objects.create_user(
            username="apikeyuser",
            email="apikeyuser@example.com",
            password="pass1234",
        )

    def _create_key(self, name="default-key", access_level=ACCESS_LEVEL_ALL):
        return self.repo.create_for_user(
            user_id=self.user.pk,
            name=name,
            access_level=access_level,
        )

    def test_create_returns_entity_and_raw_key(self):
        result = self._create_key("my-key")

        self.assertIsNotNone(result.api_key)
        self.assertIsNotNone(result.raw_key)
        self.assertEqual(result.api_key.name, "my-key")
        self.assertEqual(result.api_key.access_level, ACCESS_LEVEL_ALL)

    def test_list_returns_active_keys_only(self):
        self._create_key("key-a")
        result_b = self._create_key("key-b")
        self.repo.revoke(result_b.api_key.id, self.user.pk)

        keys = self.repo.list_for_user(self.user.pk)

        names = [k.name for k in keys]
        self.assertIn("key-a", names)
        self.assertNotIn("key-b", names)

    def test_list_returns_empty_for_user_with_no_keys(self):
        other_user = User.objects.create_user(
            username="nokeys", email="nokeys@example.com", password="pass"
        )
        keys = self.repo.list_for_user(other_user.pk)
        self.assertEqual(keys, [])

    def test_get_active_by_id_returns_entity(self):
        result = self._create_key("lookup-key")

        entity = self.repo.get_active_by_id(result.api_key.id, self.user.pk)

        self.assertIsNotNone(entity)
        self.assertEqual(entity.id, result.api_key.id)

    def test_get_active_by_id_returns_none_for_revoked_key(self):
        result = self._create_key("revoked-key")
        self.repo.revoke(result.api_key.id, self.user.pk)

        entity = self.repo.get_active_by_id(result.api_key.id, self.user.pk)

        self.assertIsNone(entity)

    def test_get_active_by_id_returns_none_for_wrong_user(self):
        result = self._create_key("other-user-key")
        other_user = User.objects.create_user(
            username="other", email="other@example.com", password="pass"
        )

        entity = self.repo.get_active_by_id(result.api_key.id, other_user.pk)

        self.assertIsNone(entity)

    def test_revoke_returns_true_on_success(self):
        result = self._create_key("to-revoke")
        revoked = self.repo.revoke(result.api_key.id, self.user.pk)
        self.assertTrue(revoked)

    def test_revoke_returns_false_for_already_revoked_key(self):
        result = self._create_key("double-revoke")
        self.repo.revoke(result.api_key.id, self.user.pk)

        second = self.repo.revoke(result.api_key.id, self.user.pk)

        self.assertFalse(second)

    def test_revoke_returns_false_for_nonexistent_key(self):
        revoked = self.repo.revoke(99999, self.user.pk)
        self.assertFalse(revoked)

    def test_exists_active_with_name_returns_true_when_present(self):
        self._create_key("existing-name")

        exists = self.repo.exists_active_with_name(self.user.pk, "existing-name")

        self.assertTrue(exists)

    def test_exists_active_with_name_returns_false_after_revoke(self):
        result = self._create_key("revokedname")
        self.repo.revoke(result.api_key.id, self.user.pk)

        exists = self.repo.exists_active_with_name(self.user.pk, "revokedname")

        self.assertFalse(exists)

    def test_exists_active_with_name_is_isolated_per_user(self):
        other_user = User.objects.create_user(
            username="isolateduser", email="isolated@example.com", password="pass"
        )
        self.repo.create_for_user(other_user.pk, name="shared-name")

        exists = self.repo.exists_active_with_name(self.user.pk, "shared-name")

        self.assertFalse(exists)
