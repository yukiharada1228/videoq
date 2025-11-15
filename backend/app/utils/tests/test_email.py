"""
Tests for email utilities
"""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase, override_settings

from app.utils.email import (
    build_email_verification_link,
    build_password_reset_link,
    send_email_verification,
    send_password_reset_email,
)

User = get_user_model()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class EmailVerificationTests(TestCase):
    """Tests for email verification functions"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    def test_build_email_verification_link(self):
        """Test building email verification link"""
        link = build_email_verification_link(self.user)

        self.assertIn("uid=", link)
        self.assertIn("token=", link)
        self.assertIn("/verify-email", link)

    @override_settings(FRONTEND_URL="https://example.com")
    def test_build_email_verification_link_custom_frontend(self):
        """Test building email verification link with custom frontend URL"""
        link = build_email_verification_link(self.user)

        self.assertTrue(link.startswith("https://example.com"))

    def test_send_email_verification(self):
        """Test sending email verification"""
        send_email_verification(self.user)

        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, [self.user.email])
        self.assertIn("Temporary Registration Complete", email.subject)
        self.assertIn("verify-email", email.body)

    @patch("app.utils.email.send_mail")
    def test_send_email_verification_failure(self, mock_send_mail):
        """Test email verification send failure"""
        mock_send_mail.side_effect = Exception("SMTP error")

        with self.assertRaises(Exception):
            send_email_verification(self.user)

        mock_send_mail.assert_called_once()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class PasswordResetEmailTests(TestCase):
    """Tests for password reset email functions"""

    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="testpass123",
        )

    def test_build_password_reset_link(self):
        """Test building password reset link"""
        link = build_password_reset_link(self.user)

        self.assertIn("uid=", link)
        self.assertIn("token=", link)
        self.assertIn("/reset-password", link)

    @override_settings(FRONTEND_URL="https://example.com")
    def test_build_password_reset_link_custom_frontend(self):
        """Test building password reset link with custom frontend URL"""
        link = build_password_reset_link(self.user)

        self.assertTrue(link.startswith("https://example.com"))

    def test_send_password_reset_email(self):
        """Test sending password reset email"""
        send_password_reset_email(self.user)

        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, [self.user.email])
        self.assertIn("Password Reset Instructions", email.subject)
        self.assertIn("reset-password", email.body)

    @patch("app.utils.email.send_mail")
    def test_send_password_reset_email_failure(self, mock_send_mail):
        """Test password reset email send failure"""
        mock_send_mail.side_effect = Exception("SMTP error")

        with self.assertRaises(Exception):
            send_password_reset_email(self.user)

        mock_send_mail.assert_called_once()

