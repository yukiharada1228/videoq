"""Unit tests for auth domain entities and policies."""

from datetime import datetime
from unittest import TestCase

from app.domain.auth.entities import (
    ApiKeyEntity,
    DuplicateApiKeyName,
    InvalidApiKeyAccessLevel,
    InvalidApiKeyName,
    assert_api_key_name_available,
    assert_valid_api_key_access_level,
    normalize_api_key_name,
    is_scope_allowed_for_access_level,
)
from app.domain.auth.scopes import SCOPE_CHAT_WRITE, SCOPE_READ, SCOPE_WRITE


class AuthDomainPoliciesTests(TestCase):
    def test_all_access_level_allows_any_scope(self):
        self.assertTrue(is_scope_allowed_for_access_level("all", SCOPE_WRITE))
        self.assertTrue(is_scope_allowed_for_access_level("all", SCOPE_READ))

    def test_read_only_access_level_allows_read_and_chat_write(self):
        self.assertTrue(is_scope_allowed_for_access_level("read_only", SCOPE_READ))
        self.assertTrue(is_scope_allowed_for_access_level("read_only", SCOPE_CHAT_WRITE))

    def test_unknown_access_level_is_denied(self):
        self.assertFalse(is_scope_allowed_for_access_level("unknown", SCOPE_READ))

    def test_api_key_entity_delegates_scope_authorization(self):
        entity = ApiKeyEntity(
            id=1,
            name="key",
            prefix="abcd",
            access_level="read_only",
            last_used_at=None,
            created_at=datetime.now(),
        )

        self.assertTrue(entity.allows_scope(SCOPE_READ))
        self.assertFalse(entity.allows_scope(SCOPE_WRITE))

    def test_assert_api_key_name_available_raises_when_name_exists(self):
        with self.assertRaises(DuplicateApiKeyName):
            assert_api_key_name_available(name="dup", exists_active_with_name=True)

    def test_assert_valid_api_key_access_level_raises_for_unknown_level(self):
        with self.assertRaises(InvalidApiKeyAccessLevel):
            assert_valid_api_key_access_level("admin")

    def test_normalize_api_key_name_trims_input(self):
        self.assertEqual(normalize_api_key_name("  my-key  "), "my-key")

    def test_normalize_api_key_name_raises_when_blank(self):
        with self.assertRaises(InvalidApiKeyName):
            normalize_api_key_name("   ")
