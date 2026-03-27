"""
Tests for DjangoAccountDeletionGateway.deactivate_user — security: user_id must not
appear in anonymized username or email address.
"""

import re

from django.contrib.auth import get_user_model
from django.test import TestCase

from app.infrastructure.repositories.django_account_deletion_repository import (
    DjangoAccountDeletionGateway,
)

User = get_user_model()

# Expected formats after anonymization:
#   username: deleted__<32-char lowercase hex>
#   email:    deleted__<32-char lowercase hex>@invalid.local
_USERNAME_PATTERN = re.compile(r"^deleted__[0-9a-f]{32}$")
_EMAIL_PATTERN = re.compile(r"^deleted__[0-9a-f]{32}@invalid\.local$")


class DeactivateUserAnonymizationTests(TestCase):
    """deactivate_user must not embed user_id in username or email."""

    def _create_user(self):
        return User.objects.create_user(
            username="targetuser",
            email="target@example.com",
            password="testpass123",
        )

    def test_username_does_not_contain_user_id_as_segment(self):
        """user_id must not appear as a __ delimited segment in the username."""
        user = self._create_user()
        gateway = DjangoAccountDeletionGateway()
        gateway.deactivate_user(user.id)

        user.refresh_from_db()
        # The old format was "deleted__{user_id}__{suffix}" — verify that exact
        # user_id segment is absent regardless of surrounding delimiters.
        self.assertNotIn(f"__{user.id}__", user.username)
        self.assertNotRegex(user.username, rf"(^|__)0*{user.id}(__|\b)")

    def test_email_does_not_contain_user_id_as_segment(self):
        """user_id must not appear as a __ delimited segment in the email."""
        user = self._create_user()
        gateway = DjangoAccountDeletionGateway()
        gateway.deactivate_user(user.id)

        user.refresh_from_db()
        self.assertNotIn(f"__{user.id}__", user.email)
        self.assertNotRegex(user.email, rf"(^|__)0*{user.id}(__|\b)")

    def test_username_matches_uuid_hex_format(self):
        """Username must follow deleted__<uuid_hex> format."""
        user = self._create_user()
        gateway = DjangoAccountDeletionGateway()
        gateway.deactivate_user(user.id)

        user.refresh_from_db()
        self.assertRegex(user.username, _USERNAME_PATTERN)

    def test_email_matches_uuid_hex_format(self):
        """Email must follow deleted__<uuid_hex>@invalid.local format."""
        user = self._create_user()
        gateway = DjangoAccountDeletionGateway()
        gateway.deactivate_user(user.id)

        user.refresh_from_db()
        self.assertRegex(user.email, _EMAIL_PATTERN)

    def test_user_is_deactivated(self):
        user = self._create_user()
        gateway = DjangoAccountDeletionGateway()
        gateway.deactivate_user(user.id)

        user.refresh_from_db()
        self.assertFalse(user.is_active)
