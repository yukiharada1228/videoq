"""Unit tests for auth domain value objects."""

from unittest import TestCase

from app.domain.auth.value_objects import (
    EmailAddress,
    RefreshTokenValue,
    UidTokenComponent,
    Username,
)


class AuthValueObjectsTests(TestCase):
    def test_username_from_raw_trims_whitespace(self):
        self.assertEqual(Username.from_raw("  alice  ").value, "alice")

    def test_username_from_raw_rejects_blank_when_required(self):
        with self.assertRaises(ValueError):
            Username.from_raw("  ", require_non_blank=True)

    def test_email_from_raw_trims_whitespace(self):
        self.assertEqual(EmailAddress.from_raw("  a@example.com  ").value, "a@example.com")

    def test_email_from_raw_rejects_blank_when_required(self):
        with self.assertRaises(ValueError):
            EmailAddress.from_raw(" ", require_non_blank=True)

    def test_refresh_token_from_raw_trims_whitespace(self):
        self.assertEqual(RefreshTokenValue.from_raw("  tkn  ").value, "tkn")

    def test_refresh_token_from_raw_rejects_blank_when_required(self):
        with self.assertRaises(ValueError):
            RefreshTokenValue.from_raw(" ", require_non_blank=True)

    def test_uid_token_component_from_raw_trims_whitespace(self):
        self.assertEqual(UidTokenComponent.from_raw("  uid  ").value, "uid")

    def test_uid_token_component_from_raw_rejects_blank_when_required(self):
        with self.assertRaises(ValueError):
            UidTokenComponent.from_raw(" ", require_non_blank=True)

